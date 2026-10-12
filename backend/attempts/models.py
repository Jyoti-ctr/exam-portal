from django.conf import settings
from django.db import models
from django.utils import timezone


class ExamAttempt(models.Model):
    """
    Tracks an individual student's session for a specific exam.
    Start time, remaining time, and deadline are strictly server-authoritative.
    """
    class AttemptStatus(models.TextChoices):
        NOT_STARTED = 'NOT_STARTED', 'Not Started'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        SUBMITTED = 'SUBMITTED', 'Submitted'
        AUTO_SUBMITTED = 'AUTO_SUBMITTED', 'Auto-Submitted (Expired)'
        EXPIRED = 'EXPIRED', 'Expired'

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attempts'
    )
    exam = models.ForeignKey(
        'exams.Exam',
        on_delete=models.CASCADE,
        related_name='attempts'
    )
    attempt_number = models.PositiveIntegerField(
        default=1,
        help_text="1-based sequence number for the student attempt"
    )
    status = models.CharField(
        max_length=20,
        choices=AttemptStatus.choices,
        default=AttemptStatus.IN_PROGRESS
    )
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        help_text="Server-enforced hard deadline for this attempt"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['student', 'exam', 'status']),
            models.Index(fields=['expires_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'exam', 'attempt_number'],
                name='unique_attempt_per_student_exam_number'
            )
        ]

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def remaining_seconds(self):
        if self.is_completed or self.status != self.AttemptStatus.IN_PROGRESS:
            return 0
        now = timezone.now()
        if now >= self.expires_at:
            return 0
        return int((self.expires_at - now).total_seconds())

    def __str__(self):
        return f"{self.student.username} - {self.exam.title} ({self.get_status_display()})"


class StudentAnswer(models.Model):
    """
    Stores an answer to a question within an attempt.
    Designed for idempotent auto-saving: updates existing records without duplication.
    """
    attempt = models.ForeignKey(
        ExamAttempt,
        on_delete=models.CASCADE,
        related_name='answers'
    )
    question = models.ForeignKey(
        'exams.Question',
        on_delete=models.CASCADE,
        related_name='student_answers'
    )
    selected_option = models.ForeignKey(
        'exams.Option',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='selected_by_answers'
    )
    text_response = models.TextField(
        blank=True,
        help_text="Response text for descriptive questions"
    )
    is_marked_for_review = models.BooleanField(
        default=False,
        help_text="Flag for the student to revisit before final submission"
    )
    awarded_marks = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Marks awarded after evaluation (automatic or manual)"
    )
    evaluator_comment = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Ensures exactly one answer record per question per attempt
        constraints = [
            models.UniqueConstraint(
                fields=['attempt', 'question'],
                name='unique_answer_per_attempt_question'
            )
        ]

    def __str__(self):
        return f"Answer for Q{self.question_id} (Attempt {self.attempt_id})"
