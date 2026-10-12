from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from attempts.models import ExamAttempt
from .models import ProctoringEvent
from .serializers import ProctoringEventSerializer, ProctoringEventCreateSerializer
from .incident_analysis import analyze_attempt_events


class LogProctoringEventView(APIView):
    """
    POST: Student client reports an audit signal (e.g. fullscreen exit, tab switch, face counts).
    Includes cooldown debounce to prevent client-side spamming.
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
            student=request.user
        )

        if attempt.status != ExamAttempt.AttemptStatus.IN_PROGRESS or attempt.is_completed:
            return Response(
                {'error': 'Attempt is not currently in progress.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cooldown check: ignore duplicate identical events within 3 seconds
        recent_event = ProctoringEvent.objects.filter(
            attempt=attempt,
            event_type=event_type,
            timestamp__gte=timezone.now() - timezone.timedelta(seconds=3)
        ).first()

        if recent_event:
            return Response(
                ProctoringEventSerializer(recent_event).data,
                status=status.HTTP_200_OK
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
        if not self.request.user.is_superuser and attempt.exam.creator != self.request.user:
            return ProctoringEvent.objects.none()
        return attempt.proctoring_events.all().order_by('timestamp')


class FacultyAttemptAnalysisView(APIView):
    """
    GET: Provides AI-assisted / rule-based incident analysis and explainable risk evaluation.
    Groups events into incidents with start/end times and clear rationale.
    """
    permission_classes = [IsFacultyUser]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(
            ExamAttempt.objects.select_related('student', 'exam'),
            id=attempt_id
        )

        if not request.user.is_superuser and attempt.exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        events = list(attempt.proctoring_events.all().order_by('timestamp'))
        analysis_data = analyze_attempt_events(events, attempt)
        return Response(analysis_data, status=status.HTTP_200_OK)


class FacultyReviewEventView(APIView):
    """
    PATCH: Allows faculty to annotate a flagged event with review status and notes.
    """
    permission_classes = [IsFacultyUser]

    def patch(self, request, event_id):
        event = get_object_or_404(ProctoringEvent.objects.select_related('attempt__exam'), id=event_id)
        if not request.user.is_superuser and event.attempt.exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('review_status')
        if new_status and new_status in ProctoringEvent.ReviewStatus.values:
            event.review_status = new_status
            event.is_reviewed = True

        if 'is_reviewed' in request.data:
            event.is_reviewed = bool(request.data['is_reviewed'])

        if 'reviewer_notes' in request.data:
            event.reviewer_notes = request.data['reviewer_notes']

        event.save()
        return Response(ProctoringEventSerializer(event).data, status=status.HTTP_200_OK)


class FacultyBulkReviewIncidentView(APIView):
    """
    POST: Allows faculty to update review status and notes across an entire incident (group of event IDs).
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(ExamAttempt, id=attempt_id)
        if not request.user.is_superuser and attempt.exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        event_ids = request.data.get('event_ids', [])
        new_status = request.data.get('review_status', ProctoringEvent.ReviewStatus.REVIEWED)
        notes = request.data.get('reviewer_notes', '')

        if not event_ids:
            return Response({'error': 'No event IDs provided.'}, status=status.HTTP_400_BAD_REQUEST)

        updated_count = ProctoringEvent.objects.filter(
            attempt=attempt,
            id__in=event_ids
        ).update(
            is_reviewed=True,
            review_status=new_status,
            reviewer_notes=notes
        )

        return Response({
            'status': 'success',
            'updated_count': updated_count,
            'review_status': new_status
        }, status=status.HTTP_200_OK)
