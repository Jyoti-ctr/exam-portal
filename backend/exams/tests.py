from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import Exam, Question, Option

User = get_user_model()


class ExamModelTests(TestCase):
    def setUp(self):
        self.faculty = User.objects.create_user(
            username='instructor',
            email='instructor@example.com',
            password='testpassword123',
            role=User.Role.FACULTY
        )
        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Data Structures Midterm',
            description='Online test covering Arrays, Stacks, Queues',
            creator=self.faculty,
            duration_minutes=60,
            total_marks=50.0,
            pass_marks=20.0,
            start_window=self.now,
            end_window=self.now + timedelta(hours=3),
            is_published=False
        )

    def test_exam_creation_and_question_relations(self):
        self.assertEqual(str(self.exam), 'Data Structures Midterm (60 mins)')
        self.assertFalse(self.exam.is_published)

        # Create MCQ Question
        q1 = Question.objects.create(
            exam=self.exam,
            question_text='What is the time complexity of pushing onto a stack?',
            question_type=Question.QuestionType.MCQ,
            marks=2.0,
            negative_marks=0.5,
            order=1
        )
        opt1 = Option.objects.create(question=q1, option_text='O(1)', is_correct=True, order=1)
        opt2 = Option.objects.create(question=q1, option_text='O(n)', is_correct=False, order=2)

        self.assertEqual(q1.options.count(), 2)
        self.assertTrue(opt1.is_correct)
        self.assertFalse(opt2.is_correct)

        # Create Descriptive Question
        q2 = Question.objects.create(
            exam=self.exam,
            question_text='Explain how a circular queue avoids memory waste.',
            question_type=Question.QuestionType.DESCRIPTIVE,
            marks=5.0,
            order=2
        )
        self.assertEqual(self.exam.questions.count(), 2)
        self.assertEqual(q2.question_type, Question.QuestionType.DESCRIPTIVE)
