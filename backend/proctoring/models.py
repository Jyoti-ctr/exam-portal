from django.db import models


class ProctoringEvent(models.Model):
    """
    Transparent logs of client-side events captured during an active exam attempt.
    Provides signals for faculty review rather than automated accusations.
    """
    class EventType(models.TextChoices):
        TAB_BLUR = 'TAB_BLUR', 'Switched Tab / Window Blurred'
        TAB_FOCUS = 'TAB_FOCUS', 'Returned to Exam Tab'
        FULLSCREEN_EXIT = 'FULLSCREEN_EXIT', 'Exited Fullscreen Mode'
        FULLSCREEN_ENTER = 'FULLSCREEN_ENTER', 'Entered Fullscreen Mode'
        CAMERA_DISCONNECTED = 'CAMERA_DISCONNECTED', 'Camera Feed Lost or Blocked'
        CAMERA_RECONNECTED = 'CAMERA_RECONNECTED', 'Camera Feed Restored'
        DEVTOOLS_DETECTED = 'DEVTOOLS_DETECTED', 'Browser Developer Tools Opened'
        NETWORK_OFFLINE = 'NETWORK_OFFLINE', 'Network Connection Lost'
        NETWORK_ONLINE = 'NETWORK_ONLINE', 'Network Connection Restored'

    attempt = models.ForeignKey(
        'attempts.ExamAttempt',
        on_delete=models.CASCADE,
        related_name='proctoring_events'
    )
    event_type = models.CharField(
        max_length=30,
        choices=EventType.choices
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Contextual details such as duration outside fullscreen, device info, etc."
    )
    is_reviewed = models.BooleanField(default=False)
    reviewer_notes = models.TextField(blank=True)

    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['attempt', 'event_type']),
            models.Index(fields=['attempt', 'timestamp']),
        ]

    def __str__(self):
        return f"[{self.get_event_type_display()}] Attempt {self.attempt_id} at {self.timestamp}"
