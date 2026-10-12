from django.conf import settings
from django.db import models


class Exam(models.Model):
    """
    Core Exam model configured by faculty.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_exams'
    )
    duration_minutes = models.PositiveIntegerField(
        help_text="Time allowed for a student attempt once started"
    )
    total_marks = models.DecimalField(max_digits=6, decimal_places=2, default=0.0)
    pass_marks = models.DecimalField(max_digits=6, decimal_places=2, default=0.0)
    start_window = models.DateTimeField(
        help_text="Earliest time an attempt can be initiated"
    )
    end_window = models.DateTimeField(
        help_text="Latest time by which the exam window closes"
    )
    shuffle_questions = models.BooleanField(
        default=False,
        help_text="Randomize question sequence for each student"
    )
    shuffle_options = models.BooleanField(
        default=False,
        help_text="Randomize MCQ choices sequence for each question"
    )
    enable_proctoring = models.BooleanField(
        default=True,
        help_text="Require camera permission and track browser visibility changes"
    )
    max_attempts = models.PositiveIntegerField(
        default=1,
        help_text="Maximum allowed attempts per student for this exam"
    )
    allow_retake = models.BooleanField(
        default=False,
        help_text="Whether retakes are permitted when student has remaining attempts"
    )
    is_published = models.BooleanField(
        default=False,
        help_text="When False, students cannot view or start this exam"
    )
    assigned_students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='assigned_exams',
        help_text="Students permitted to take this exam. If empty, all enrolled students may access when published."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.duration_minutes} mins)"


class Question(models.Model):
    """
    Questions belonging to an Exam.
    """
    class QuestionType(models.TextChoices):
        MCQ = 'MCQ', 'Multiple Choice Question'
        DESCRIPTIVE = 'DESCRIPTIVE', 'Descriptive / Long Answer'

    exam = models.ForeignKey(
        Exam,
        on_delete=models.CASCADE,
        related_name='questions'
    )
    question_text = models.TextField()
    question_type = models.CharField(
        max_length=20,
        choices=QuestionType.choices,
        default=QuestionType.MCQ
    )
    marks = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)
    negative_marks = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.0,
        help_text="Deducted for incorrect MCQ selection (e.g. 0.25)"
    )
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"Q{self.order} ({self.get_question_type_display()}): {self.question_text[:50]}"


class Option(models.Model):
    """
    Multiple choice options for an MCQ Question.
    is_correct is NEVER exposed to student API responses until explicitly permitted.
    """
    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name='options'
    )
    option_text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.option_text} {'(Correct)' if self.is_correct else ''}"
