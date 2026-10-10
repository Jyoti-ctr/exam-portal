from django.conf import settings
from django.db import models


class ExamResult(models.Model):
    """
    Final evaluated results for an exam attempt.
    Students can access results ONLY when is_published is True.
    """
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
        help_text="When True, results are made visible to the student"
    )
    evaluated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evaluated_results'
    )
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['exam', 'is_published']),
            models.Index(fields=['student', 'is_published']),
        ]

    def recalculate(self):
        """
        Recalculates total score, percentage, and pass/fail status.
        """
        self.total_score = self.objective_score + self.descriptive_score
        if self.exam.total_marks > 0:
            self.percentage = round(float((self.total_score / self.exam.total_marks) * 100), 2)
        else:
            self.percentage = 0.0
        self.passed = self.total_score >= self.exam.pass_marks
        self.save()

    def __str__(self):
        return f"Result for {self.student.username} - {self.exam.title}: {self.total_score}/{self.exam.total_marks}"
