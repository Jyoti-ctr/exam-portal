from datetime import timedelta
from decimal import Decimal
import threading
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam, Question, Option
from attempts.models import ExamAttempt, StudentAnswer
from proctoring.models import ProctoringEvent
from results.models import ExamResult

User = get_user_model()


class SecurityRequirementsTests(APITestCase):
    def setUp(self):
        # Create users
        self.faculty = User.objects.create_user(
            username='prof_oak',
            email='oak@example.com',
            password='password123',
            role=User.Role.FACULTY
        )
        self.other_faculty = User.objects.create_user(
            username='prof_elm',
            email='elm@example.com',
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

        # Create exam
        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Security & Biology Exam',
            description='Test exam for portal security',
            creator=self.faculty,
            duration_minutes=30,
            total_marks=10.0,
            pass_marks=4.0,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True,
            max_attempts=1,
            allow_retake=False,
            enable_proctoring=True
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
            question_text='What does DNA stand for?',
            question_type=Question.QuestionType.MCQ,
            marks=5.0,
            negative_marks=0.0,
            order=2
        )
        self.opt2_correct = Option.objects.create(
            question=self.q2,
            option_text='Deoxyribonucleic Acid',
            is_correct=True,
            order=1
        )

    # -------------------------------------------------------------
    # 1. Submitting an exam twice (Idempotence & No duplication)
    # -------------------------------------------------------------
    def test_01_submitting_exam_twice_is_idempotent(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        self.assertEqual(start_res.status_code, status.HTTP_201_CREATED)
        attempt_id = start_res.data['id']

        # Save an answer
        self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_correct.id,
        })

        submit_url = f'/api/v1/student/attempts/{attempt_id}/submit/'
        # First submission
        res1 = self.client.post(submit_url)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertIn(res1.data['status'], ['SUBMITTED', 'submitted'])

        attempt = ExamAttempt.objects.get(id=attempt_id)
        self.assertTrue(attempt.is_completed)
        self.assertEqual(attempt.status, ExamAttempt.AttemptStatus.SUBMITTED)
        self.assertIsNotNone(attempt.submitted_at)

        # Second submission (must be idempotent)
        res2 = self.client.post(submit_url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'already_submitted')

        # Total attempts for this student must still be 1
        self.assertEqual(ExamAttempt.objects.filter(student=self.student, exam=self.exam).count(), 1)

    # -------------------------------------------------------------
    # 2. Editing an answer after submission is rejected
    # -------------------------------------------------------------
    def test_02_editing_answer_after_submission_rejected(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Submit attempt
        self.client.post(f'/api/v1/student/attempts/{attempt_id}/submit/')

        # Attempt to save or edit an answer after submission
        save_url = f'/api/v1/student/attempts/{attempt_id}/autosave/'
        save_res = self.client.post(save_url, {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_wrong.id,
        })
        self.assertEqual(save_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot modify answers', save_res.data['error'])

    # -------------------------------------------------------------
    # 3. Starting another attempt when retakes are disabled
    # -------------------------------------------------------------
    def test_03_starting_another_attempt_when_retakes_disabled_rejected(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Finalize first attempt
        self.client.post(f'/api/v1/student/attempts/{attempt_id}/submit/')

        # Attempt to start a second attempt when retakes are disabled
        retake_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        self.assertEqual(retake_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('maximum allowed attempts', retake_res.data['error'])

        # Now test with retake allowed
        self.exam.allow_retake = True
        self.exam.max_attempts = 2
        self.exam.save()

        retake_res2 = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        self.assertEqual(retake_res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retake_res2.data['attempt_number'], 2)

    # -------------------------------------------------------------
    # 4. Direct API bypass without assignment and invalid option checks
    # -------------------------------------------------------------
    def test_04_direct_api_bypass_without_assignment_rejected(self):
        # Create private exam restricted to gary_oak
        private_exam = Exam.objects.create(
            title='Restricted Honors Exam',
            creator=self.faculty,
            duration_minutes=20,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True
        )
        private_exam.assigned_students.set([self.other_student])

        # ash_ketchum calls start API directly
        self.client.force_authenticate(user=self.student)
        bypass_res = self.client.post(f'/api/v1/student/exams/{private_exam.id}/start/')
        self.assertEqual(bypass_res.status_code, status.HTTP_403_FORBIDDEN)

        # Test selecting option belonging to a different question
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        invalid_opt_res = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt2_correct.id,  # belongs to q2, not q1!
        })
        self.assertEqual(invalid_opt_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('does not belong to this question', invalid_opt_res.data['error'])

    # -------------------------------------------------------------
    # 5. Attempting to save an answer after deadline
    # -------------------------------------------------------------
    def test_05_attempting_to_save_answer_after_deadline(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Force deadline into the past on the server
        attempt = ExamAttempt.objects.get(id=attempt_id)
        attempt.expires_at = timezone.now() - timedelta(minutes=5)
        attempt.save()

        # Try to autosave answer
        save_res = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_correct.id,
        })
        self.assertEqual(save_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', save_res.data['error'])

        # Attempt should now be AUTO_SUBMITTED
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, ExamAttempt.AttemptStatus.AUTO_SUBMITTED)
        self.assertTrue(attempt.is_completed)

    # -------------------------------------------------------------
    # 6. Refreshing exam page does not extend server timer
    # -------------------------------------------------------------
    def test_06_refreshing_page_does_not_extend_deadline(self):
        self.client.force_authenticate(user=self.student)
        start_res1 = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        original_deadline = start_res1.data['expires_at']
        original_attempt_id = start_res1.data['id']

        # Simulate student refreshing browser 10 seconds later
        start_res2 = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        self.assertEqual(start_res2.status_code, status.HTTP_200_OK)
        self.assertEqual(start_res2.data['id'], original_attempt_id)
        self.assertEqual(start_res2.data['expires_at'], original_deadline)

    # -------------------------------------------------------------
    # 7. Simultaneous requests to start attempt (Concurrency safety)
    # -------------------------------------------------------------
    def test_07_simultaneous_requests_start_attempt_concurrency(self):
        self.client.force_authenticate(user=self.student)
        # Calling start endpoint sequentially and rapidly
        res1 = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        res2 = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')

        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['id'], res2.data['id'])

        # Ensure only 1 attempt exists in database
        self.assertEqual(
            ExamAttempt.objects.filter(student=self.student, exam=self.exam).count(),
            1
        )

    # -------------------------------------------------------------
    # 8. Unauthorized access to another student's attempt
    # -------------------------------------------------------------
    def test_08_unauthorized_access_to_another_students_attempt(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Now authenticate as gary_oak and attempt to tamper with ash's attempt
        self.client.force_authenticate(user=self.other_student)

        # 1. Try to read ash's attempt
        get_res = self.client.get(f'/api/v1/student/attempts/{attempt_id}/')
        self.assertEqual(get_res.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Try to autosave on ash's attempt
        save_res = self.client.post(f'/api/v1/student/attempts/{attempt_id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1_wrong.id,
        })
        self.assertEqual(save_res.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Try to submit ash's attempt
        sub_res = self.client.post(f'/api/v1/student/attempts/{attempt_id}/submit/')
        self.assertEqual(sub_res.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------
    # 9. Recording and retrieving browser events
    # -------------------------------------------------------------
    def test_09_recording_and_retrieving_browser_events(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        # Student logs tab blur and fullscreen exit
        log_url = '/api/v1/proctoring/student/events/'
        self.client.post(log_url, {
            'attempt_id': attempt_id,
            'event_type': 'TAB_BLUR',
            'details': {'reason': 'switched tab'},
        }, format='json')
        self.client.post(log_url, {
            'attempt_id': attempt_id,
            'event_type': 'FULLSCREEN_EXIT',
            'details': {'reason': 'escaped fullscreen'},
        }, format='json')

        # Faculty retrieves events
        self.client.force_authenticate(user=self.faculty)
        faculty_events_url = f'/api/v1/proctoring/faculty/attempts/{attempt_id}/events/'
        fac_res = self.client.get(faculty_events_url)
        self.assertEqual(fac_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(fac_res.data), 2)

        # Faculty checks AI-assisted analysis summary
        analysis_url = f'/api/v1/proctoring/faculty/attempts/{attempt_id}/analysis/'
        ana_res = self.client.get(analysis_url)
        self.assertEqual(ana_res.status_code, status.HTTP_200_OK)
        self.assertIn('risk_level', ana_res.data)
        self.assertIn('incidents', ana_res.data)
        self.assertGreater(len(ana_res.data['incidents']), 0)

        # Unauthorized faculty (prof_elm) cannot access
        self.client.force_authenticate(user=self.other_faculty)
        unauth_res = self.client.get(faculty_events_url)
        self.assertEqual(unauth_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(unauth_res.data), 0)

    # -------------------------------------------------------------
    # 10. Recording multiple-face and no-face events
    # -------------------------------------------------------------
    def test_10_recording_multiple_face_and_no_face_events(self):
        self.client.force_authenticate(user=self.student)
        start_res = self.client.post(f'/api/v1/student/exams/{self.exam.id}/start/')
        attempt_id = start_res.data['id']

        log_url = '/api/v1/proctoring/student/events/'
        # Log NO_FACE_DETECTED
        res_no_face = self.client.post(log_url, {
            'attempt_id': attempt_id,
            'event_type': 'NO_FACE_DETECTED',
            'details': {'face_count': 0, 'duration_seconds': 6},
        }, format='json')
        self.assertEqual(res_no_face.status_code, status.HTTP_201_CREATED)

        # Log MULTIPLE_FACES_DETECTED
        res_multi = self.client.post(log_url, {
            'attempt_id': attempt_id,
            'event_type': 'MULTIPLE_FACES_DETECTED',
            'details': {'face_count': 2, 'duration_seconds': 4},
        }, format='json')
        self.assertEqual(res_multi.status_code, status.HTTP_201_CREATED)

        # Verify incident categorization and risk severity
        self.client.force_authenticate(user=self.faculty)
        ana_res = self.client.get(f'/api/v1/proctoring/faculty/attempts/{attempt_id}/analysis/')
        self.assertEqual(ana_res.status_code, status.HTTP_200_OK)

        categories = [inc['category'] for inc in ana_res.data['incidents']]
        self.assertIn('NO_FACE', categories)
        self.assertIn('MULTIPLE_FACES', categories)

        # Multiple faces incident should be HIGH severity
        multi_inc = next(inc for inc in ana_res.data['incidents'] if inc['category'] == 'MULTIPLE_FACES')
        self.assertEqual(multi_inc['severity'], 'HIGH')

