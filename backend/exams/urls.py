from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FacultyExamViewSet,
    FacultyQuestionViewSet,
    StudentExamListView,
    StudentExamDetailView,
)

router = DefaultRouter()
router.register(r'exams', FacultyExamViewSet, basename='faculty-exams')
router.register(r'questions', FacultyQuestionViewSet, basename='faculty-questions')

urlpatterns = [
    # Faculty routes
    path('faculty/', include(router.urls)),

    # Student routes
    path('student/exams/', StudentExamListView.as_view(), name='student-exams-list'),
    path('student/exams/<int:pk>/', StudentExamDetailView.as_view(), name='student-exam-detail'),
]
