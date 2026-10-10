from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from exams.models import Exam, Question
from .models import ExamAttempt, StudentAnswer
from .serializers import (
    ExamAttemptDetailSerializer,
    AutosavePayloadSerializer,
    StudentAnswerSerializer,
)
from .grading import grade_mcq_attempt


class StartOrResumeAttemptView(APIView):
    """
    POST: Begins a new attempt or resumes an active one.
    Guarantees server-authoritative timer and prevents duplicate active attempts.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, exam_id):
        exam = get_object_or_404(Exam, id=exam_id, is_published=True)
        user = request.user
        now = timezone.now()

        # Check window validity
        if now < exam.start_window:
            return Response(
                {'error': 'Exam window has not opened yet.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if now > exam.end_window:
            return Response(
                {'error': 'Exam window has closed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check student assignment
        if exam.assigned_students.exists() and not exam.assigned_students.filter(id=user.id).exists():
            return Response(
                {'error': 'You are not authorized to take this exam.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check existing attempt
        attempt = ExamAttempt.objects.filter(student=user, exam=exam).first()

        if attempt:
            # Check if active
            if attempt.status == ExamAttempt.AttemptStatus.IN_PROGRESS:
                if attempt.is_expired:
                    # Auto-submit expired attempt
                    with transaction.atomic():
                        attempt.status = ExamAttempt.AttemptStatus.EXPIRED
                        attempt.is_completed = True
                        attempt.submitted_at = now
                        attempt.save()
                        grade_mcq_attempt(attempt)
                    return Response({
                        'error': 'Your attempt has expired and was automatically submitted.',
                        'is_completed': True,
                    }, status=status.HTTP_400_BAD_REQUEST)
                # Resume active attempt
                serializer = ExamAttemptDetailSerializer(attempt)
                return Response(serializer.data, status=status.HTTP_200_OK)

            # Already submitted
            return Response({
                'error': 'You have already submitted this exam.',
                'is_completed': True,
                'submitted_at': attempt.submitted_at
            }, status=status.HTTP_400_BAD_REQUEST)

        # Create new attempt
        with transaction.atomic():
            duration_delta = timedelta(minutes=exam.duration_minutes)
            # Deadline is either now + duration, or exam end_window (whichever comes first)
            hard_deadline = min(now + duration_delta, exam.end_window)

            attempt = ExamAttempt.objects.create(
                student=user,
                exam=exam,
                expires_at=hard_deadline,
                status=ExamAttempt.AttemptStatus.IN_PROGRESS
            )

        serializer = ExamAttemptDetailSerializer(attempt)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AutosaveAnswerView(APIView):
    """
    POST: High-speed, idempotent autosave for student answers.
    Updates existing answer record without creating duplicates.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, attempt_id):
        serializer = AutosavePayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        now = timezone.now()

        with transaction.atomic():
            attempt = ExamAttempt.objects.select_for_update().filter(
                id=attempt_id,
                student=user
            ).first()

            if not attempt:
                return Response(
                    {'error': 'Attempt not found or unauthorized.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            if attempt.is_completed or attempt.status != ExamAttempt.AttemptStatus.IN_PROGRESS:
                return Response(
                    {'error': 'Cannot save answers on a submitted or expired attempt.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if now > attempt.expires_at:
                attempt.status = ExamAttempt.AttemptStatus.EXPIRED
                attempt.is_completed = True
                attempt.submitted_at = now
                attempt.save()
                grade_mcq_attempt(attempt)
                return Response(
                    {'error': 'Exam time has expired. Attempt was automatically submitted.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            question_id = serializer.validated_data['question_id']
            opt_id = serializer.validated_data.get('selected_option_id')
            text_ans = serializer.validated_data.get('text_response', '')
            marked = serializer.validated_data.get('is_marked_for_review', False)

            # Ensure question belongs to this exam
            question = get_object_or_404(Question, id=question_id, exam=attempt.exam)

            # Idempotent update or create
            answer, created = StudentAnswer.objects.update_or_create(
                attempt=attempt,
                question=question,
                defaults={
                    'selected_option_id': opt_id,
                    'text_response': text_ans,
                    'is_marked_for_review': marked,
                }
            )

        return Response({
            'status': 'saved',
            'question_id': question_id,
            'remaining_seconds': attempt.remaining_seconds,
            'updated_at': answer.updated_at
        }, status=status.HTTP_200_OK)


class HeartbeatView(APIView):
    """
    POST: Checks server clock vs deadline and auto-submits expired attempts.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(ExamAttempt, id=attempt_id, student=request.user)
        now = timezone.now()

        if attempt.status == ExamAttempt.AttemptStatus.IN_PROGRESS and now > attempt.expires_at:
            with transaction.atomic():
                attempt.status = ExamAttempt.AttemptStatus.EXPIRED
                attempt.is_completed = True
                attempt.submitted_at = now
                attempt.save()
                grade_mcq_attempt(attempt)
            return Response({
                'status': 'expired',
                'remaining_seconds': 0,
                'message': 'Exam time expired and attempt was submitted.'
            })

        return Response({
            'status': 'active' if not attempt.is_completed else 'completed',
            'remaining_seconds': attempt.remaining_seconds
        })


class SubmitAttemptView(APIView):
    """
    POST: Finalizes attempt submission and triggers automatic MCQ grading.
    Guarded against duplicate submissions.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, attempt_id):
        with transaction.atomic():
            attempt = ExamAttempt.objects.select_for_update().filter(
                id=attempt_id,
                student=request.user
            ).first()

            if not attempt:
                return Response(
                    {'error': 'Attempt not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Idempotent response if already submitted
            if attempt.is_completed:
                return Response({
                    'status': 'already_submitted',
                    'message': 'This attempt was already submitted.',
                    'submitted_at': attempt.submitted_at
                }, status=status.HTTP_200_OK)

            now = timezone.now()
            attempt.status = ExamAttempt.AttemptStatus.SUBMITTED
            attempt.is_completed = True
            attempt.submitted_at = now
            attempt.save()

            # Execute grading
            grade_mcq_attempt(attempt)

        return Response({
            'status': 'submitted',
            'message': 'Your exam has been submitted successfully.',
            'submitted_at': attempt.submitted_at
        }, status=status.HTTP_200_OK)


class FacultyExamAttemptsView(generics.ListAPIView):
    """
    GET: Allows faculty to monitor all student attempts for a particular exam.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = ExamAttemptDetailSerializer

    def get_queryset(self):
        exam_id = self.kwargs['exam_id']
        exam = get_object_or_404(Exam, id=exam_id)
        # Verify ownership or superuser
        if not self.request.user.is_superuser and exam.creator != self.request.user:
            return ExamAttempt.objects.none()
        return exam.attempts.select_related('student', 'exam').prefetch_related('answers')
