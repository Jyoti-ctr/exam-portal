from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam, Question, Option
from attempts.models import ExamAttempt, StudentAnswer
from attempts.grading import grade_attempt

User = get_user_model()


class QuestionTypesAndNavigationTests(APITestCase):
    def setUp(self):
        self.faculty = User.objects.create_user(
            username='prof_hopper',
            email='hopper@example.com',
            password='Password123!',
            role=User.Role.FACULTY
        )
        self.student = User.objects.create_user(
            username='student_ada',
            email='ada@example.com',
            password='Password123!',
            role=User.Role.STUDENT
        )
        self.now = timezone.now()
        self.exam_fwd = Exam.objects.create(
            title='Forward Only Navigation Exam',
            creator=self.faculty,
            duration_minutes=45,
            total_marks=100.0,
            pass_marks=40.0,
            navigation_mode=Exam.NavigationMode.FORWARD_ONLY,
            warning_threshold=8,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True
        )
        self.exam_bidir = Exam.objects.create(
            title='Bidirectional Navigation Exam',
            creator=self.faculty,
            duration_minutes=45,
            total_marks=50.0,
            pass_marks=20.0,
            navigation_mode=Exam.NavigationMode.FORWARD_BACKWARD,
            warning_threshold=8,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True
        )

    # -------------------------------------------------------------
    # 1. Question Type Creation & Validation
    # -------------------------------------------------------------
    def test_faculty_create_mcq_single(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'What is 2 + 2?',
            'question_type': 'MCQ',
            'marks': 4.0,
            'negative_marks': 1.0,
            'order': 1,
            'options': [
                {'option_text': '3', 'is_correct': False, 'order': 1},
                {'option_text': '4', 'is_correct': True, 'order': 2},
                {'option_text': '5', 'is_correct': False, 'order': 3},
            ]
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['question_type'], 'MCQ')
        self.assertEqual(len(res.data['options']), 3)

    def test_faculty_create_multiple_select(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'Select prime numbers:',
            'question_type': 'MULTIPLE_SELECT',
            'marks': 5.0,
            'negative_marks': 0.0,
            'order': 2,
            'options': [
                {'option_text': '2', 'is_correct': True, 'order': 1},
                {'option_text': '3', 'is_correct': True, 'order': 2},
                {'option_text': '4', 'is_correct': False, 'order': 3},
                {'option_text': '5', 'is_correct': True, 'order': 4},
            ]
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['question_type'], 'MULTIPLE_SELECT')

    def test_faculty_create_true_false(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'Python is interpreted.',
            'question_type': 'TRUE_FALSE',
            'marks': 2.0,
            'negative_marks': 0.5,
            'order': 3,
            'options': [
                {'option_text': 'True', 'is_correct': True, 'order': 1},
                {'option_text': 'False', 'is_correct': False, 'order': 2},
            ]
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_faculty_create_numerical(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'Value of pi to 2 decimals:',
            'question_type': 'NUMERICAL',
            'marks': 3.0,
            'negative_marks': 0.0,
            'order': 4,
            'correct_answer_data': {
                'value': 3.14,
                'tolerance': 0.01
            }
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['correct_answer_data']['value'], 3.14)

    def test_faculty_create_fill_in_blanks(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'The capital of France is ___ and Germany is ___.',
            'question_type': 'FILL_IN_BLANKS',
            'marks': 4.0,
            'negative_marks': 0.0,
            'order': 5,
            'correct_answer_data': {
                'blanks': [
                    {'index': 0, 'accepted': ['Paris']},
                    {'index': 1, 'accepted': ['Berlin']}
                ]
            }
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_faculty_create_matching(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'Match languages with their paradigm:',
            'question_type': 'MATCHING',
            'marks': 4.0,
            'negative_marks': 0.0,
            'order': 6,
            'correct_answer_data': {
                'pairs': [
                    {'left': 'Haskell', 'right': 'Functional'},
                    {'left': 'Java', 'right': 'Object-Oriented'},
                    {'left': 'Prolog', 'right': 'Logic'}
                ]
            }
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_faculty_create_code_question(self):
        self.client.force_authenticate(user=self.faculty)
        payload = {
            'exam': self.exam_fwd.id,
            'question_text': 'Write a Python function to reverse a linked list.',
            'question_type': 'CODE',
            'marks': 10.0,
            'negative_marks': 0.0,
            'order': 7,
            'question_metadata': {
                'language': 'python',
                'starter_code': 'def reverse_list(head):\n    pass'
            }
        }
        res = self.client.post('/api/v1/faculty/questions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['manual_grading'])

    def test_invalid_question_rejected(self):
        self.client.force_authenticate(user=self.faculty)
        # 1. Invalid marks <= 0
        res1 = self.client.post('/api/v1/faculty/questions/', {
            'exam': self.exam_fwd.id,
            'question_text': 'Bad marks',
            'question_type': 'SHORT_ANSWER',
            'marks': 0.0,
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Numerical missing value
        res2 = self.client.post('/api/v1/faculty/questions/', {
            'exam': self.exam_fwd.id,
            'question_text': 'Bad numerical',
            'question_type': 'NUMERICAL',
            'marks': 2.0,
            'correct_answer_data': {'tolerance': 0.1}
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Multiple select with zero correct options
        res3 = self.client.post('/api/v1/faculty/questions/', {
            'exam': self.exam_fwd.id,
            'question_text': 'Bad multiple select',
            'question_type': 'MULTIPLE_SELECT',
            'marks': 2.0,
            'options': [
                {'option_text': 'A', 'is_correct': False},
                {'option_text': 'B', 'is_correct': False}
            ]
        }, format='json')
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 2. Student Answer Key Leak Prevention
    # -------------------------------------------------------------
    def test_student_api_does_not_reveal_answers(self):
        # Create MCQ with correct option
        q = Question.objects.create(
            exam=self.exam_fwd,
            question_text='Secret Question',
            question_type=Question.QuestionType.MCQ,
            marks=2.0,
            order=1
        )
        Option.objects.create(question=q, option_text='Wrong', is_correct=False)
        Option.objects.create(question=q, option_text='Secret Answer', is_correct=True)

        # Numerical question with correct_answer_data
        Question.objects.create(
            exam=self.exam_fwd,
            question_text='Numerical Secret',
            question_type=Question.QuestionType.NUMERICAL,
            marks=2.0,
            correct_answer_data={'value': 99.5, 'tolerance': 0.1},
            order=2
        )

        self.client.force_authenticate(user=self.student)
        # Start attempt
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam_fwd.id}/start/')
        self.assertEqual(start_res.status_code, status.HTTP_201_CREATED)
        attempt_id = start_res.data['id']

        detail_res = self.client.get(f'/api/v1/student/attempts/{attempt_id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)

        questions = detail_res.data['questions']
        for q_data in questions:
            # correct_answer_data must be completely stripped
            self.assertNotIn('correct_answer_data', q_data)
            # options must not have is_correct
            for opt in q_data.get('options', []):
                self.assertNotIn('is_correct', opt)

    # -------------------------------------------------------------
    # 3. Forward Only Navigation Rules Enforcement
    # -------------------------------------------------------------
    def test_forward_only_navigation_enforcement(self):
        q1 = Question.objects.create(exam=self.exam_fwd, question_text='Q1', question_type='SHORT_ANSWER', marks=2.0, order=1)
        q2 = Question.objects.create(exam=self.exam_fwd, question_text='Q2', question_type='SHORT_ANSWER', marks=2.0, order=2)
        q3 = Question.objects.create(exam=self.exam_fwd, question_text='Q3', question_type='SHORT_ANSWER', marks=2.0, order=3)

        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam_fwd.id}/start/')
        attempt_id = start_res.data['id']

        # Currently at index 0 (Q1)
        # 1. Autosaving Q1 is allowed
        res_save_q1 = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q1.id,
            'text_response': 'Answer to Q1'
        }, format='json')
        self.assertEqual(res_save_q1.status_code, status.HTTP_200_OK)

        # 2. Skipping ahead to Q2 or Q3 is strictly REJECTED
        res_skip = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q2.id,
            'text_response': 'Trying to skip ahead'
        }, format='json')
        self.assertEqual(res_skip.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Forward Only rule', res_skip.data['error'])

        # 3. Advance to next question (index 1 / Q2)
        advance_res = self.client.post(f'/api/v1/student/attempts/{attempt_id}/advance/')
        self.assertEqual(advance_res.status_code, status.HTTP_200_OK)
        self.assertEqual(advance_res.data['current_question_index'], 1)

        # 4. Autosaving Q2 is now allowed
        res_save_q2 = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q2.id,
            'text_response': 'Answer to Q2'
        }, format='json')
        self.assertEqual(res_save_q2.status_code, status.HTTP_200_OK)

        # 5. Backward modification of Q1 is strictly REJECTED
        res_back_q1 = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q1.id,
            'text_response': 'Trying to change past answer'
        }, format='json')
        self.assertEqual(res_back_q1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Forward Only rule', res_back_q1.data['error'])

        # 6. Reload preserves permitted progression
        reload_res = self.client.get(f'/api/v1/student/attempts/{attempt_id}/')
        self.assertEqual(reload_res.data['current_question_index'], 1)

        # Check preserved answers
        saved = {a['question_id']: a['text_response'] for a in reload_res.data['saved_answers']}
        self.assertEqual(saved[q1.id], 'Answer to Q1')
        self.assertEqual(saved[q2.id], 'Answer to Q2')

    # -------------------------------------------------------------
    # 4. Bidirectional Navigation Allowed
    # -------------------------------------------------------------
    def test_bidirectional_navigation_allows_revisiting(self):
        q1 = Question.objects.create(exam=self.exam_bidir, question_text='B1', question_type='SHORT_ANSWER', marks=2.0, order=1)
        q2 = Question.objects.create(exam=self.exam_bidir, question_text='B2', question_type='SHORT_ANSWER', marks=2.0, order=2)

        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam_bidir.id}/start/')
        attempt_id = start_res.data['id']

        # Save Q2 first
        res2 = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q2.id,
            'text_response': 'Answer to B2'
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        # Save Q1
        res1 = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q1.id,
            'text_response': 'Answer to B1'
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Re-save Q2 with edited answer
        res2_edit = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': q2.id,
            'text_response': 'Edited Answer to B2'
        }, format='json')
        self.assertEqual(res2_edit.status_code, status.HTTP_200_OK)

    # -------------------------------------------------------------
    # 5. Objective Grading for Different Types
    # -------------------------------------------------------------
    def test_objective_grading_numerical_blanks_matching(self):
        # Numerical
        q_num = Question.objects.create(
            exam=self.exam_bidir,
            question_text='Sqrt of 16',
            question_type=Question.QuestionType.NUMERICAL,
            marks=5.0,
            negative_marks=1.0,
            correct_answer_data={'value': 4.0, 'tolerance': 0.05},
            order=1
        )
        # Blanks
        q_blank = Question.objects.create(
            exam=self.exam_bidir,
            question_text='Fill: ___ and ___',
            question_type=Question.QuestionType.FILL_IN_BLANKS,
            marks=6.0,
            negative_marks=0.0,
            correct_answer_data={
                'blanks': [
                    {'index': 0, 'accepted': ['HTML', 'HyperText']},
                    {'index': 1, 'accepted': ['CSS']}
                ]
            },
            order=2
        )
        # Matching
        q_match = Question.objects.create(
            exam=self.exam_bidir,
            question_text='Match symbols',
            question_type=Question.QuestionType.MATCHING,
            marks=4.0,
            negative_marks=0.0,
            correct_answer_data={
                'pairs': [
                    {'left': 'H', 'right': 'Hydrogen'},
                    {'left': 'O', 'right': 'Oxygen'}
                ]
            },
            order=3
        )

        attempt = ExamAttempt.objects.create(
            student=self.student,
            exam=self.exam_bidir,
            expires_at=self.now + timedelta(minutes=45)
        )

        # Correct numerical answer within tolerance (4.02 within 0.05 of 4.0)
        StudentAnswer.objects.create(
            attempt=attempt,
            question=q_num,
            answer_data={'numerical_value': 4.02}
        )
        # Correct blanks (case-insensitive)
        StudentAnswer.objects.create(
            attempt=attempt,
            question=q_blank,
            answer_data={'blanks': ['html', 'css']}
        )
        # Correct matching pairs
        StudentAnswer.objects.create(
            attempt=attempt,
            question=q_match,
            answer_data={'matches': {'H': 'Hydrogen', 'O': 'Oxygen'}}
        )

        result = grade_attempt(attempt)
        # 5.0 + 6.0 + 4.0 = 15.0
        self.assertEqual(result.objective_score, Decimal('15.0'))
        self.assertEqual(result.total_score, Decimal('15.0'))
