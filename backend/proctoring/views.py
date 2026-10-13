from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from attempts.models import ExamAttempt
from attempts.grading import grade_attempt
from .models import ProctoringEvent
from .serializers import (
    ProctoringEventSerializer,
    ProctoringEventCreateSerializer,
    EVENT_TYPE_ALIASES,
)
from .incident_analysis import analyze_attempt_events


class LogProctoringEventView(APIView):
    """
    POST: Student client reports an audit signal (e.g. fullscreen exit, tab switch, face counts).
    Maintains authoritative server-side warning counter.
    Triggers automatic exam submission when warning count exceeds the threshold (warning 9 when threshold is 8).
    """
    permission_classes = [IsStudentUser]

    def post(self, request):
        serializer = ProctoringEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attempt_id = serializer.validated_data['attempt_id']
        event_type = serializer.validated_data['event_type']
        details = serializer.validated_data.get('details', {})

        with transaction.atomic():
            # Concurrency-safe lock on the attempt record
            attempt = ExamAttempt.objects.select_for_update().select_related('exam').filter(
                id=attempt_id,
                student=request.user
            ).first()

            if not attempt:
                return Response(
                    {'error': 'Attempt not found or unauthorized.'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Reject event if attempt already completed or submitted
            if attempt.is_completed or attempt.status in [
                ExamAttempt.AttemptStatus.SUBMITTED,
                ExamAttempt.AttemptStatus.AUTO_SUBMITTED,
                ExamAttempt.AttemptStatus.EXPIRED,
            ]:
                return Response({
                    'error': 'Attempt is not currently in progress or is already finalized.',
                    'status': 'already_finalized',
                    'is_completed': True,
                    'warning_count': attempt.warning_count,
                    'submission_reason': attempt.submission_reason,
                }, status=status.HTTP_400_BAD_REQUEST)

            # Cooldown check: ignore duplicate identical events within 3.5 seconds
            recent_event = ProctoringEvent.objects.filter(
                attempt=attempt,
                event_type=event_type,
                timestamp__gte=timezone.now() - timezone.timedelta(seconds=3.5)
            ).first()

            threshold = attempt.exam.warning_threshold or 8

            if recent_event:
                resp_data = ProctoringEventSerializer(recent_event).data
                resp_data.update({
                    'warning_count': attempt.warning_count,
                    'max_warnings': threshold,
                    'warning_incremented': False,
                    'is_final_warning': attempt.warning_count == threshold,
                    'auto_submitted': False,
                    'message': 'Duplicate event suppressed by cooldown.'
                })
                return Response(resp_data, status=status.HTTP_200_OK)

            # Determine qualifying warning categories
            configured_categories = attempt.exam.monitored_warning_categories or []
            if configured_categories:
                qualifying_events = {EVENT_TYPE_ALIASES.get(cat, cat) for cat in configured_categories}
            else:
                qualifying_events = {
                    ProctoringEvent.EventType.TAB_BLUR,
                    ProctoringEvent.EventType.FULLSCREEN_EXIT,
                    ProctoringEvent.EventType.CAMERA_DISCONNECTED,
                    ProctoringEvent.EventType.MULTIPLE_FACES_DETECTED,
                }

            # If camera monitoring is not enabled on exam, don't count CAMERA_DISCONNECTED as a cheating warning
            if not attempt.exam.enable_proctoring and ProctoringEvent.EventType.CAMERA_DISCONNECTED in qualifying_events:
                qualifying_events.remove(ProctoringEvent.EventType.CAMERA_DISCONNECTED)

            is_qualifying_warning = event_type in qualifying_events

            event = ProctoringEvent.objects.create(
                attempt=attempt,
                event_type=event_type,
                details=details
            )

            if is_qualifying_warning:
                attempt.warning_count += 1
                new_warning_count = attempt.warning_count
                event.details['warning_count'] = new_warning_count
                event.details['is_qualifying_warning'] = True
                event.save()

                # Trigger automatic submission if warning count strictly exceeds threshold (e.g. 9 > 8)
                if new_warning_count > threshold:
                    attempt.status = ExamAttempt.AttemptStatus.AUTO_SUBMITTED
                    attempt.is_completed = True
                    attempt.submitted_at = timezone.now()
                    attempt.submission_reason = 'warning_threshold_exceeded'
                    attempt.save()

                    # Execute authoritative objective grading
                    grade_attempt(attempt)

                    resp_data = ProctoringEventSerializer(event).data
                    resp_data.update({
                        'warning_count': new_warning_count,
                        'max_warnings': threshold,
                        'warning_incremented': True,
                        'is_final_warning': False,
                        'auto_submitted': True,
                        'submission_reason': 'warning_threshold_exceeded',
                        'message': f'Warning limit exceeded ({new_warning_count}/{threshold}). The exam has been automatically submitted.'
                    })
                    return Response(resp_data, status=status.HTTP_201_CREATED)

                elif new_warning_count == threshold:
                    attempt.save()
                    resp_data = ProctoringEventSerializer(event).data
                    resp_data.update({
                        'warning_count': new_warning_count,
                        'max_warnings': threshold,
                        'warning_incremented': True,
                        'is_final_warning': True,
                        'auto_submitted': False,
                        'message': f'FINAL WARNING: You have reached {new_warning_count} of {threshold} warnings. Any further violation will automatically submit your exam immediately.'
                    })
                    return Response(resp_data, status=status.HTTP_201_CREATED)

                else:
                    attempt.save()
                    resp_data = ProctoringEventSerializer(event).data
                    resp_data.update({
                        'warning_count': new_warning_count,
                        'max_warnings': threshold,
                        'warning_incremented': True,
                        'is_final_warning': False,
                        'auto_submitted': False,
                        'message': f'Warning {new_warning_count} of {threshold}: Violation detected ({event.get_event_type_display()}).'
                    })
                    return Response(resp_data, status=status.HTTP_201_CREATED)

            else:
                # Non-warning event (recovery or technical info)
                resp_data = ProctoringEventSerializer(event).data
                resp_data.update({
                    'warning_count': attempt.warning_count,
                    'max_warnings': threshold,
                    'warning_incremented': False,
                    'is_final_warning': False,
                    'auto_submitted': False,
                })
                return Response(resp_data, status=status.HTTP_201_CREATED)


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
