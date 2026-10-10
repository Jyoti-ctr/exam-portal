from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from attempts.models import ExamAttempt
from .models import ProctoringEvent
from .serializers import ProctoringEventSerializer, ProctoringEventCreateSerializer


class LogProctoringEventView(APIView):
    """
    POST: Student client reports an audit signal (e.g. fullscreen exit, tab switch).
    """
    permission_classes = [IsStudentUser]

    def post(self, request):
        serializer = ProctoringEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attempt_id = serializer.validated_data['attempt_id']
        event_type = serializer.validated_data['event_type']
        details = serializer.validated_data.get('details', {})

        # Ensure attempt belongs to user and is currently active
        attempt = get_object_or_404(
            ExamAttempt,
            id=attempt_id,
            student=request.user,
            status=ExamAttempt.AttemptStatus.IN_PROGRESS
        )

        event = ProctoringEvent.objects.create(
            attempt=attempt,
            event_type=event_type,
            details=details
        )

        return Response(
            ProctoringEventSerializer(event).data,
            status=status.HTTP_201_CREATED
        )


class FacultyAttemptEventsListView(generics.ListAPIView):
    """
    GET: Allows faculty to audit all proctoring events logged for a specific attempt.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = ProctoringEventSerializer

    def get_queryset(self):
        attempt_id = self.kwargs['attempt_id']
        attempt = get_object_or_404(ExamAttempt, id=attempt_id)
        # Verify exam ownership or superuser
        if not self.request.user.is_superuser and attempt.exam.creator != self.request.user:
            return ProctoringEvent.objects.none()
        return attempt.proctoring_events.all().order_by('timestamp')


class FacultyReviewEventView(APIView):
    """
    PATCH: Allows faculty to annotate a flagged event with review notes.
    """
    permission_classes = [IsFacultyUser]

    def patch(self, request, event_id):
        event = get_object_or_404(ProctoringEvent, id=event_id)
        if not request.user.is_superuser and event.attempt.exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        is_reviewed = request.data.get('is_reviewed', True)
        notes = request.data.get('reviewer_notes', event.reviewer_notes)

        event.is_reviewed = is_reviewed
        event.reviewer_notes = notes
        event.save()

        return Response(ProctoringEventSerializer(event).data)
