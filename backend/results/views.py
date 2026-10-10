from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from exams.models import Exam, Question
from attempts.models import ExamAttempt, StudentAnswer
from .models import ExamResult
from .serializers import (
    ExamResultSerializer,
    DescriptiveEvaluationPayloadSerializer,
)


class StudentExamResultView(APIView):
    """
    GET: Student views the result of an exam attempt.
    Enforces the rule: results are HIDDEN until faculty explicitly publishes them.
    """
    permission_classes = [IsStudentUser]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(ExamAttempt, id=attempt_id, student=request.user)
        result = getattr(attempt, 'result', None)

        if not result or not result.is_published:
            return Response({
                'is_published': False,
                'message': 'Results for this exam have not been published by faculty yet.'
            }, status=status.HTTP_200_OK)

        serializer = ExamResultSerializer(result)
        return Response(serializer.data, status=status.HTTP_200_OK)


class StudentPublishedResultsListView(generics.ListAPIView):
    """
    GET: Returns list of all released results for the student.
    """
    permission_classes = [IsStudentUser]
    serializer_class = ExamResultSerializer

    def get_queryset(self):
        return ExamResult.objects.filter(
            student=self.request.user,
            is_published=True
        ).select_related('exam', 'student')


class FacultyExamResultsListView(generics.ListAPIView):
    """
    GET: Faculty reviews all scores and attempts for a specific exam.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = ExamResultSerializer

    def get_queryset(self):
        exam_id = self.kwargs['exam_id']
        exam = get_object_or_404(Exam, id=exam_id)
        if not self.request.user.is_superuser and exam.creator != self.request.user:
            return ExamResult.objects.none()
        return ExamResult.objects.filter(exam=exam).select_related('student', 'exam', 'attempt')


class FacultyEvaluateDescriptiveView(APIView):
    """
    POST: Faculty awards marks and feedback for a descriptive response.
    Automatically updates descriptive_score and recomputes total/percentage.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request):
        serializer = DescriptiveEvaluationPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer_id = serializer.validated_data['answer_id']
        awarded_marks = serializer.validated_data['awarded_marks']
        feedback = serializer.validated_data.get('evaluator_comment', '')

        with transaction.atomic():
            answer = get_object_or_404(StudentAnswer, id=answer_id)
            attempt = answer.attempt
            exam = attempt.exam

            if not request.user.is_superuser and exam.creator != request.user:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

            # Validate that marks do not exceed question maximum marks
            if awarded_marks > answer.question.marks or awarded_marks < Decimal('0.0'):
                return Response(
                    {'error': f'Marks must be between 0 and maximum {answer.question.marks}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            answer.awarded_marks = awarded_marks
            answer.evaluator_comment = feedback
            answer.save()

            # Recalculate total descriptive score across all descriptive questions
            descriptive_answers = attempt.answers.filter(
                question__question_type=Question.QuestionType.DESCRIPTIVE,
                awarded_marks__isnull=False
            )
            total_descriptive = sum(a.awarded_marks for a in descriptive_answers)

            result = attempt.result
            result.descriptive_score = total_descriptive
            result.evaluated_by = request.user
            result.recalculate()

        return Response(ExamResultSerializer(result).data, status=status.HTTP_200_OK)


class FacultyPublishResultsView(APIView):
    """
    POST: Faculty releases or unreleases results to all students of an exam.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, exam_id):
        exam = get_object_or_404(Exam, id=exam_id)
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        publish = request.data.get('is_published', True)

        updated_count = ExamResult.objects.filter(exam=exam).update(is_published=publish)

        return Response({
            'status': 'success',
            'is_published': publish,
            'updated_count': updated_count,
            'message': f"Results {'published to students' if publish else 'hidden from students'} successfully."
        }, status=status.HTTP_200_OK)
