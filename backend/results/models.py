from django.conf import settings
from django.db import models
from django.utils import timezone


class ExamResult(models.Model):
    """
    Final evaluated results for an exam attempt with full faculty review lifecycle.
    Students can access results ONLY when is_published is True.
    """
    class ReviewStatus(models.TextChoices):
        SUBMITTED = 'SUBMITTED', 'Submitted'
        PENDING_REVIEW = 'PENDING_REVIEW', 'Pending Review'
        UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
        FLAGGED = 'FLAGGED', 'Flagged for Investigation'
        REVIEWED = 'REVIEWED', 'Reviewed'
        PUBLISHED = 'PUBLISHED', 'Published'
        RETURNED_FOR_CLARIFICATION = 'RETURNED_FOR_CLARIFICATION', 'Returned for Clarification'

    attempt = models.OneToOneField(
        'attempts.ExamAttempt',
        on_delete=models.CASCADE,
        related_name='result'
    )
    exam = models.ForeignKey(
        'exams.Exam',
        on_delete=models.CASCADE,
        related_name='results'
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='exam_results'
    )
    objective_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0.0,
        help_text="Calculated automatically from MCQ responses"
    )
    descriptive_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0.0,
        help_text="Evaluated manually by faculty for descriptive questions"
    )
    total_score = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0.0
    )
    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0.0
    )
    passed = models.BooleanField(default=False)
    is_published = models.BooleanField(
        default=False,
        help_text="When True, results and feedback are made visible to the student"
    )
    review_status = models.CharField(
        max_length=30,
        choices=ReviewStatus.choices,
        default=ReviewStatus.SUBMITTED,
        help_text="Current state in the faculty evaluation and review workflow"
    )
    flag_reason = models.TextField(
        blank=True,
        help_text="Notes explaining why this submission was flagged for investigation"
    )
    internal_notes = models.TextField(
        blank=True,
        help_text="Confidential notes for faculty and administrators"
    )
    evaluated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evaluated_results'
    )
    feedback = models.TextField(
        blank=True,
        help_text="Written feedback visible to the student once published"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    # Student feedback acknowledgment & clarification
    student_acknowledged = models.BooleanField(default=False)
    student_acknowledged_at = models.DateTimeField(null=True, blank=True)
    student_acknowledgment_notes = models.TextField(blank=True)

    clarification_requested = models.BooleanField(default=False)
    clarification_request_text = models.TextField(blank=True)
    clarification_request_at = models.DateTimeField(null=True, blank=True)
    clarification_response_text = models.TextField(blank=True)
    clarification_responded_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['exam', 'is_published']),
            models.Index(fields=['student', 'is_published']),
            models.Index(fields=['review_status']),
        ]

    def recalculate(self):
        """
        Recalculates total score, percentage, and pass/fail status.
        """
        from decimal import Decimal
        obj = Decimal(str(self.objective_score or '0.0'))
        desc = Decimal(str(self.descriptive_score or '0.0'))
        self.total_score = obj + desc

        exam_total = Decimal(str(self.exam.total_marks or '0.0'))
        if exam_total > Decimal('0.0'):
            self.percentage = round(float((self.total_score / exam_total) * Decimal('100.0')), 2)
        else:
            self.percentage = 0.0

        pass_threshold = Decimal(str(self.exam.pass_marks or '0.0'))
        self.passed = self.total_score >= pass_threshold
        self.save()

    def record_history(self, reviewer, action, prev_status, new_status, notes=''):
        """
        Creates an immutable history record for this review transition.
        """
        return ReviewHistory.objects.create(
            result=self,
            reviewer=reviewer,
            action=action,
            previous_status=prev_status,
            new_status=new_status,
            total_score=self.total_score,
            feedback=self.feedback,
            notes=notes or self.internal_notes,
        )

    def __str__(self):
        return f"Result for {self.student.username} - {self.exam.title}: {self.total_score}/{self.exam.total_marks} ({self.get_review_status_display()})"


class ReviewHistory(models.Model):
    """
    Audit trail capturing grading adjustments, decision transitions, and feedback history.
    """
    result = models.ForeignKey(
        ExamResult,
        on_delete=models.CASCADE,
        related_name='history'
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    action = models.CharField(max_length=60)
    previous_status = models.CharField(max_length=30)
    new_status = models.CharField(max_length=30)
    total_score = models.DecimalField(max_digits=6, decimal_places=2)
    feedback = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.action}] Result {self.result_id} by {self.reviewer} at {self.created_at}"
