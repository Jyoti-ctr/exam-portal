from django.urls import path
from .views import (
    LogProctoringEventView,
    FacultyAttemptEventsListView,
    FacultyReviewEventView,
)

urlpatterns = [
    # Student logs client audit signal
    path('student/events/', LogProctoringEventView.as_view(), name='proctoring-log-event'),

    # Faculty review routes
    path('faculty/attempts/<int:attempt_id>/events/', FacultyAttemptEventsListView.as_view(), name='faculty-attempt-events'),
    path('faculty/events/<int:event_id>/review/', FacultyReviewEventView.as_view(), name='faculty-event-review'),
]
