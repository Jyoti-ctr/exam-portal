from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam, Question, Option
from attempts.models import ExamAttempt, StudentAnswer
from results.models import ExamResult

User = get_user_model()


class ExamPortalAPITests(APITestCase):
    def setUp(self):
        # Create users
        self.faculty = User.objects.create_user(
            username='prof_oak',
            email='oak@example.com',
            password='password123',
            role=User.Role.FACULTY
        )
        self.student = User.objects.create_user(
            username='ash_ketchum',
            email='ash@example.com',
            password='password123',
            role=User.Role.STUDENT
        )
        self.other_student = User.objects.create_user(
            username='gary_oak',
            email='gary@example.com',
            password='password123',
            role=User.Role.STUDENT
        )

        # Faculty creates an exam
        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Intro to Biology',
            description='Cells and Organisms',
            creator=self.faculty,
            duration_minutes=30,
            total_marks=10.0,
            pass_marks=4.0,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True
        )

        # Questions
        self.q1 = Question.objects.create(
            exam=self.exam,
            question_text='What is the powerhouse of the cell?',
            question_type=Question.QuestionType.MCQ,
            marks=5.0,
            negative_marks=1.0,
            order=1
        )
        self.opt1_correct = Option.objects.create(
            question=self.q1,
            option_text='Mitochondria',
            is_correct=True,
            order=1
        )
        self.opt1_wrong = Option.objects.create(
            question=self.q1,
            option_text='Ribosome',
            is_correct=False,
            order=2
        )

        self.q2 = Question.objects.create(
            exam=self.exam,
            question_text='Describe osmosis in one sentence.',
            question_type=Question.QuestionType.DESCRIPTIVE,
            marks=5.0,
            order=2
        )

    def test_01_authentication_login_returns_token_and_role(self):
        url = '/api/v1/auth/login/'
        response = self.client.post(url, {'username': 'ash_ketchum', 'password': 'password123'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], 'STUDENT')

    def test_02_student_cannot_see_is_correct_in_questions(self):
        # Authenticate as student
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/student/exams/{self.exam.id}/start/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        questions = response.data['questions']
        self.assertEqual(len(questions), 2)
        mcq = next(q for q in questions if q['id'] == self.q1.id)
        # Verify options DO NOT contain 'is_correct' key
        for opt in mcq['options']:
            self.assertNotIn('is_correct', opt)

    def test_03_student_attempt_autosave_and_resume(self):
        self.client.force_authenticate(user=self.student)
        start_url = f'/api/v1/student/exams/{self.exam.id}/start/'
        start_res = self.client.post(start_url)
        attempt_id = start_res.data['id']

        # Autosave answer for Q1
        save_url = f'/api/v1/student/attempts/{attempt_id}/autosave/'
        save_payload = {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_correct.id,
            'is_marked_for_review': True,
        }
        save_res = self.client.post(save_url, save_payload)
        self.assertEqual(save_res.status_code, status.HTTP_200_OK)
        self.assertEqual(save_res.data['status'], 'saved')

        # Simulate browser refresh (calling start endpoint again)
        resume_res = self.client.post(start_url)
        self.assertEqual(resume_res.status_code, status.HTTP_200_OK)
        saved_answers = resume_res.data['saved_answers']
        self.assertEqual(len(saved_answers), 1)
        self.assertEqual(saved_answers[0]['selected_option_id'], self.opt1_correct.id)

    def test_04_submit_attempt_and_auto_grade_mcq(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Save correct option for Q1
        self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_correct.id,
        })

        # Submit attempt
        submit_url = f'/api/v1/student/attempts/{attempt_id}/submit/'
        submit_res = self.client.post(submit_url)
        self.assertEqual(submit_res.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_res.data['status'], 'submitted')

        # Duplicate submission attempt must be handled safely
        dup_res = self.client.post(submit_url)
        self.assertEqual(dup_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dup_res.data['status'], 'already_submitted')

        # Check that result was graded automatically for MCQ
        result = ExamResult.objects.get(attempt_id=attempt_id)
        self.assertEqual(result.objective_score, Decimal('5.0'))
        self.assertFalse(result.is_published)

    def test_05_student_cannot_view_result_before_faculty_publication(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']
        self.client.post(f'/api/v1/student/attempts/{attempt_id}/submit/')

        # Try to view result before publication
        res_url = f'/api/v1/student/results/{attempt_id}/'
        view_res = self.client.get(res_url)
        self.assertEqual(view_res.status_code, status.HTTP_200_OK)
        self.assertFalse(view_res.data['is_published'])

        # Faculty publishes result
        self.client.force_authenticate(user=self.faculty)
        pub_url = f'/api/v1/faculty/exams/{self.exam.id}/publish-results/'
        pub_res = self.client.post(pub_url, {'is_published': True})
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)

        # Student checks again after publication
        self.client.force_authenticate(user=self.student)
        view_res_after = self.client.get(res_url)
        self.assertEqual(view_res_after.status_code, status.HTTP_200_OK)
        self.assertTrue(view_res_after.data['is_published'])
        self.assertEqual(Decimal(str(view_res_after.data['total_score'])), Decimal('0.0'))  # Not passed until descriptive or total >= 4
