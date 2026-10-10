from django.urls import path
from .views import (
    StudentExamResultView,
    StudentPublishedResultsListView,
    FacultyExamResultsListView,
    FacultyEvaluateDescriptiveView,
    FacultyPublishResultsView,
)

urlpatterns = [
    # Student results routes
    path('student/results/', StudentPublishedResultsListView.as_view(), name='student-results-list'),
    path('student/results/<int:attempt_id>/', StudentExamResultView.as_view(), name='student-attempt-result'),

    # Faculty results routes
    path('faculty/exams/<int:exam_id>/results/', FacultyExamResultsListView.as_view(), name='faculty-exam-results'),
    path('faculty/results/evaluate-answer/', FacultyEvaluateDescriptiveView.as_view(), name='faculty-evaluate-answer'),
    path('faculty/exams/<int:exam_id>/publish-results/', FacultyPublishResultsView.as_view(), name='faculty-publish-results'),
]
