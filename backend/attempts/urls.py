from django.urls import path
from .views import (
    StartOrResumeAttemptView,
    AutosaveAnswerView,
    HeartbeatView,
    SubmitAttemptView,
    FacultyExamAttemptsView,
)

urlpatterns = [
    # Student attempt actions
    path('student/exams/<int:exam_id>/start/', StartOrResumeAttemptView.as_view(), name='attempt-start-resume'),
    path('student/attempts/<int:attempt_id>/autosave/', AutosaveAnswerView.as_view(), name='attempt-autosave'),
    path('student/attempts/<int:attempt_id>/heartbeat/', HeartbeatView.as_view(), name='attempt-heartbeat'),
    path('student/attempts/<int:attempt_id>/submit/', SubmitAttemptView.as_view(), name='attempt-submit'),

    # Faculty monitoring
    path('faculty/exams/<int:exam_id>/attempts/', FacultyExamAttemptsView.as_view(), name='faculty-exam-attempts'),
]
