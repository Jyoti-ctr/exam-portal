from django.urls import path
from .views import (
    StudentExamResultView,
    StudentPublishedResultsListView,
    StudentAcknowledgeFeedbackView,
    StudentRequestClarificationView,
    FacultyExamSubmissionsListView,
    FacultyAttemptReviewDetailView,
    FacultySaveReviewView,
    FacultyPublishReviewView,
    FacultyFlagSubmissionView,
    FacultyRespondClarificationView,
    FacultyExamResultsListView,
    FacultyEvaluateDescriptiveView,
    FacultyPublishResultsView,
)

urlpatterns = [
    # Student results & feedback routes
    path('student/results/', StudentPublishedResultsListView.as_view(), name='student-results-list'),
    path('student/results/<int:attempt_id>/', StudentExamResultView.as_view(), name='student-attempt-result'),
    path('student/results/<int:result_id>/acknowledge/', StudentAcknowledgeFeedbackView.as_view(), name='student-acknowledge-feedback'),
    path('student/results/<int:result_id>/request-clarification/', StudentRequestClarificationView.as_view(), name='student-request-clarification'),

    # Faculty review and marking workflow routes
    path('faculty/exams/<int:exam_id>/submissions/', FacultyExamSubmissionsListView.as_view(), name='faculty-exam-submissions'),
    path('faculty/attempts/<int:attempt_id>/review-detail/', FacultyAttemptReviewDetailView.as_view(), name='faculty-attempt-review-detail'),
    path('faculty/attempts/<int:attempt_id>/save-review/', FacultySaveReviewView.as_view(), name='faculty-save-review'),
    path('faculty/attempts/<int:attempt_id>/publish-review/', FacultyPublishReviewView.as_view(), name='faculty-publish-review'),
    path('faculty/attempts/<int:attempt_id>/flag-submission/', FacultyFlagSubmissionView.as_view(), name='faculty-flag-submission'),
    path('faculty/attempts/<int:attempt_id>/respond-clarification/', FacultyRespondClarificationView.as_view(), name='faculty-respond-clarification'),

    # Legacy compatibility routes
    path('faculty/exams/<int:exam_id>/results/', FacultyExamResultsListView.as_view(), name='faculty-exam-results'),
    path('faculty/results/evaluate-answer/', FacultyEvaluateDescriptiveView.as_view(), name='faculty-evaluate-answer'),
    path('faculty/exams/<int:exam_id>/publish-results/', FacultyPublishResultsView.as_view(), name='faculty-publish-results'),
]
