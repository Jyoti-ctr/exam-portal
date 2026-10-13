from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam, Question, Option
from attempts.models import ExamAttempt, StudentAnswer
from proctoring.models import ProctoringEvent
from results.models import ExamResult

User = get_user_model()


class WarningCounterAndAutoSubmissionTests(APITestCase):
    def setUp(self):
        self.faculty = User.objects.create_user(
            username='prof_turing',
            email='turing@example.com',
            password='Password123!',
            role=User.Role.FACULTY
        )
        self.student = User.objects.create_user(
            username='student_babbage',
            email='babbage@example.com',
            password='Password123!',
            role=User.Role.STUDENT
        )
        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Strict 8-Warning Exam',
            creator=self.faculty,
            duration_minutes=30,
            total_marks=20.0,
            pass_marks=10.0,
            enable_proctoring=True,
            is_camera_mandatory=True,
            warning_threshold=8,
            monitored_warning_categories=['TAB_BLUR', 'FULLSCREEN_EXIT', 'MULTIPLE_FACES_DETECTED', 'CAMERA_DISCONNECTED'],
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True
        )

        self.q1 = Question.objects.create(
            exam=self.exam,
            question_text='What is 5 * 5?',
            question_type=Question.QuestionType.MCQ,
            marks=10.0,
            order=1
        )
        self.opt1 = Option.objects.create(question=self.q1, option_text='25', is_correct=True)
        self.opt2 = Option.objects.create(question=self.q1, option_text='20', is_correct=False)

        self.q2 = Question.objects.create(
            exam=self.exam,
            question_text='Explain computational complexity in your own words.',
            question_type=Question.QuestionType.DESCRIPTIVE,
            marks=10.0,
            order=2
        )

        self.attempt = ExamAttempt.objects.create(
            student=self.student,
            exam=self.exam,
            expires_at=self.now + timedelta(minutes=30)
        )

    def test_warning_progression_1_through_8(self):
        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        # Trigger 7 warnings using qualifying events (aging past events past cooldown window)
        for i in range(1, 8):
            ProctoringEvent.objects.filter(attempt=self.attempt).update(
                timestamp=timezone.now() - timedelta(seconds=10)
            )
            etype = 'TAB_BLUR' if i % 2 == 1 else 'FULLSCREEN_EXIT'
            res = self.client.post(url, {
                'attempt_id': self.attempt.id,
                'event_type': etype,
                'details': {'iteration': i}
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res.data['warning_count'], i)
            self.assertFalse(res.data['is_final_warning'])
            self.assertFalse(res.data['auto_submitted'])

        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.warning_count, 7)
        self.assertEqual(self.attempt.status, ExamAttempt.AttemptStatus.IN_PROGRESS)

        # Trigger warning 8 (Final Warning)
        res8 = self.client.post(url, {
            'attempt_id': self.attempt.id,
            'event_type': 'MULTIPLE_FACES_DETECTED',
            'details': {'iteration': 8}
        }, format='json')
        self.assertEqual(res8.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res8.data['warning_count'], 8)
        self.assertTrue(res8.data['is_final_warning'])
        self.assertFalse(res8.data['auto_submitted'])

        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.warning_count, 8)
        self.assertEqual(self.attempt.status, ExamAttempt.AttemptStatus.IN_PROGRESS)

    def test_ninth_warning_triggers_automatic_submission(self):
        self.client.force_authenticate(user=self.student)
        # Pre-save an answer before auto-submission
        self.client.post(f'/api/v1/student/attempts/{self.attempt.id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt1.id
        }, format='json')

        # Fast forward warning count to 8
        self.attempt.warning_count = 8
        self.attempt.save()

        url = '/api/v1/proctoring/student/events/'
        # Trigger 9th warning
        res9 = self.client.post(url, {
            'attempt_id': self.attempt.id,
            'event_type': 'TAB_BLUR',
            'details': {'test': '9th violation'}
        }, format='json')

        self.assertEqual(res9.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res9.data['warning_count'], 9)
        self.assertTrue(res9.data['auto_submitted'])
        self.assertEqual(res9.data['submission_reason'], 'warning_threshold_exceeded')

        # Verify database state
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, ExamAttempt.AttemptStatus.AUTO_SUBMITTED)
        self.assertTrue(self.attempt.is_completed)
        self.assertEqual(self.attempt.submission_reason, 'warning_threshold_exceeded')
        self.assertEqual(self.attempt.warning_count, 9)

        # Verify auto-grading was executed and preserved
        result = ExamResult.objects.filter(attempt=self.attempt).first()
        self.assertIsNotNone(result)
        self.assertEqual(result.objective_score, Decimal('10.0'))
        # Descriptive question remains pending review
        self.assertEqual(result.review_status, ExamResult.ReviewStatus.PENDING_REVIEW)

    def test_cannot_modify_answers_after_auto_submission(self):
        self.client.force_authenticate(user=self.student)
        # Auto-submit attempt
        self.attempt.status = ExamAttempt.AttemptStatus.AUTO_SUBMITTED
        self.attempt.is_completed = True
        self.attempt.submission_reason = 'warning_threshold_exceeded'
        self.attempt.warning_count = 9
        self.attempt.save()

        # Attempt to autosave
        save_res = self.client.post(f'/api/v1/student/attempts/{self.attempt.id}/autosave/', {
            'question_id': self.q1.id,
            'selected_option_id': self.opt2.id
        }, format='json')
        self.assertEqual(save_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('submitted or finalized', save_res.data['error'])

    def test_idempotent_submit_after_auto_submission(self):
        self.client.force_authenticate(user=self.student)
        self.attempt.status = ExamAttempt.AttemptStatus.AUTO_SUBMITTED
        self.attempt.is_completed = True
        self.attempt.submission_reason = 'warning_threshold_exceeded'
        self.attempt.warning_count = 9
        self.attempt.save()

        # Call submit endpoint
        sub_res = self.client.post(f'/api/v1/student/attempts/{self.attempt.id}/submit/')
        self.assertEqual(sub_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sub_res.data['status'], 'already_submitted')
        self.assertEqual(sub_res.data['submission_reason'], 'warning_threshold_exceeded')

    def test_duplicate_event_debounce(self):
        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        # Send first TAB_BLUR
        res1 = self.client.post(url, {
            'attempt_id': self.attempt.id,
            'event_type': 'TAB_BLUR',
            'details': {'focus': False}
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['warning_count'], 1)

        # Immediately send identical TAB_BLUR within 3.5s cooldown
        res2 = self.client.post(url, {
            'attempt_id': self.attempt.id,
            'event_type': 'TAB_BLUR',
            'details': {'focus': False}
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        # Count must remain 1
        self.assertEqual(res2.data['warning_count'], 1)

        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.warning_count, 1)

    def test_non_qualifying_event_does_not_increment_warning(self):
        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        res = self.client.post(url, {
            'attempt_id': self.attempt.id,
            'event_type': 'CAMERA_RECONNECTED',
            'details': {'status': 'ok'}
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['warning_count'], 0)
        self.assertFalse(res.data['is_final_warning'])
        self.assertFalse(res.data['auto_submitted'])
