from rest_framework import viewsets, generics, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from django.db.models import Q
from accounts.permissions import IsFacultyUser, IsStudentUser
from .models import Exam, Question
from .serializers import (
    ExamFacultySerializer,
    QuestionFacultySerializer,
    ExamStudentSerializer,
)


# ==========================================
# FACULTY EXAM MANAGEMENT
# ==========================================

class FacultyExamViewSet(viewsets.ModelViewSet):
    """
    CRUD for exams, managed by faculty.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = ExamFacultySerializer

    def get_queryset(self):
        # Faculty see their own exams; superusers see all
        user = self.request.user
        if user.is_superuser:
            return Exam.objects.all().prefetch_related('questions')
        return Exam.objects.filter(creator=user).prefetch_related('questions')

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    @action(detail=True, methods=['post'], url_path='toggle-publish')
    def toggle_publish(self, request, pk=None):
        exam = self.get_object()
        # Enforce required navigation policy before publishing
        if not exam.is_published:
            if not exam.navigation_mode or exam.navigation_mode not in Exam.NavigationMode.values:
                return Response({
                    'error': 'Faculty must select a required Question Navigation setting (Forward Only or Forward and Backward) before publishing the exam.'
                }, status=status.HTTP_400_BAD_REQUEST)

        exam.is_published = not exam.is_published
        exam.save()
        return Response({
            'status': 'success',
            'is_published': exam.is_published,
            'message': f"Exam {'published' if exam.is_published else 'unpublished'} successfully."
        })

    @action(detail=True, methods=['get', 'post'], url_path='questions', parser_classes=[MultiPartParser, FormParser, JSONParser])
    def questions(self, request, pk=None):
        exam = self.get_object()
        if request.method == 'GET':
            qs = exam.questions.all().prefetch_related('options')
            serializer = QuestionFacultySerializer(qs, many=True)
            return Response(serializer.data)
        elif request.method == 'POST':
            serializer = QuestionFacultySerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(exam=exam)
            return Response(serializer.data, status=status.HTTP_201_CREATED)


class FacultyQuestionViewSet(viewsets.ModelViewSet):
    """
    CRUD for individual questions & MCQ choices.
    Enforces object-level security: faculty can only access/modify questions for their own exams.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = QuestionFacultySerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Question.objects.all().prefetch_related('options')
        return Question.objects.filter(exam__creator=user).prefetch_related('options')

    def perform_create(self, serializer):
        exam = serializer.validated_data.get('exam')
        if exam and not self.request.user.is_superuser and exam.creator != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You cannot add questions to an exam you do not own.")
        serializer.save()


# ==========================================
# STUDENT EXAM BROWSING & INSTRUCTIONS
# ==========================================

class StudentExamListView(generics.ListAPIView):
    """
    GET: Returns list of published exams available to the authenticated student.
    """
    permission_classes = [IsStudentUser]
    serializer_class = ExamStudentSerializer

    def get_queryset(self):
        user = self.request.user
        now = timezone.now()
        # Must be published and end_window in the future (or active today)
        return Exam.objects.filter(
            is_published=True,
            end_window__gte=now
        ).filter(
            Q(assigned_students=user) | Q(assigned_students__isnull=True)
        ).distinct().order_by('start_window')


class StudentExamDetailView(generics.RetrieveAPIView):
    """
    GET: Exam instructions and rules before starting.
    """
    permission_classes = [IsStudentUser]
    serializer_class = ExamStudentSerializer

    def get_queryset(self):
        user = self.request.user
        return Exam.objects.filter(is_published=True).filter(
            Q(assigned_students=user) | Q(assigned_students__isnull=True)
        ).distinct()
