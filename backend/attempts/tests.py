from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import IntegrityError
from datetime import timedelta
from exams.models import Exam, Question, Option
from .models import ExamAttempt, StudentAnswer

User = get_user_model()


class AttemptModelTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username='student_alice',
            password='testpassword123',
            role=User.Role.STUDENT
        )
        self.faculty = User.objects.create_user(
            username='faculty_bob',
            password='testpassword123',
            role=User.Role.FACULTY
        )
        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Python Programming Quiz',
            creator=self.faculty,
            duration_minutes=30,
            start_window=self.now,
            end_window=self.now + timedelta(hours=2)
        )
        self.q1 = Question.objects.create(
            exam=self.exam,
            question_text='Which keyword defines a function?',
            question_type=Question.QuestionType.MCQ,
            marks=1.0
        )
        self.opt_def = Option.objects.create(
            question=self.q1,
            option_text='def',
            is_correct=True
        )

    def test_attempt_duration_and_remaining_seconds(self):
        expires = timezone.now() + timedelta(minutes=30)
        attempt = ExamAttempt.objects.create(
            student=self.student,
            exam=self.exam,
            expires_at=expires
        )
        self.assertFalse(attempt.is_expired)
        self.assertGreater(attempt.remaining_seconds, 1700)
        self.assertEqual(attempt.status, ExamAttempt.AttemptStatus.IN_PROGRESS)

    def test_unique_answer_constraint(self):
        attempt = ExamAttempt.objects.create(
            student=self.student,
            exam=self.exam,
            expires_at=timezone.now() + timedelta(minutes=30)
        )
        StudentAnswer.objects.create(
            attempt=attempt,
            question=self.q1,
            selected_option=self.opt_def
        )

        # Creating a second answer for the SAME attempt and question must violate unique constraint
        with self.assertRaises(IntegrityError):
            StudentAnswer.objects.create(
                attempt=attempt,
                question=self.q1,
                selected_option=self.opt_def
            )
