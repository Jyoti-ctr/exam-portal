from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from exams.models import Exam
from attempts.models import ExamAttempt
from .models import ExamResult

User = get_user_model()


class ResultModelTests(TestCase):
    def test_result_recalculate_and_pass_fail(self):
        faculty = User.objects.create_user(
            username='evaluator',
            password='testpassword123',
            role=User.Role.FACULTY
        )
        student = User.objects.create_user(
            username='test_student',
            password='testpassword123',
            role=User.Role.STUDENT
        )
        now = timezone.now()
        exam = Exam.objects.create(
            title='Algorithms Test',
            creator=faculty,
            duration_minutes=45,
            total_marks=100.0,
            pass_marks=40.0,
            start_window=now,
            end_window=now + timedelta(hours=2)
        )
        attempt = ExamAttempt.objects.create(
            student=student,
            exam=exam,
            expires_at=now + timedelta(minutes=45),
            status=ExamAttempt.AttemptStatus.SUBMITTED,
            is_completed=True
        )

        result = ExamResult.objects.create(
            attempt=attempt,
            exam=exam,
            student=student,
            objective_score=30.0,
            descriptive_score=25.0,
            is_published=False
        )
        result.recalculate()

        self.assertEqual(result.total_score, 55.0)
        self.assertEqual(result.percentage, 55.0)
        self.assertTrue(result.passed)
        self.assertFalse(result.is_published)
