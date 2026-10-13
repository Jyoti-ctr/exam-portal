from rest_framework import serializers
from .models import ProctoringEvent
from attempts.models import ExamAttempt


class ProctoringEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    review_status_display = serializers.CharField(source='get_review_status_display', read_only=True)

    class Meta:
        model = ProctoringEvent
        fields = [
            'id',
            'attempt',
            'event_type',
            'event_type_display',
            'timestamp',
            'details',
            'is_reviewed',
            'review_status',
            'review_status_display',
            'reviewer_notes',
        ]
        read_only_fields = ['id', 'timestamp']


EVENT_TYPE_ALIASES = {
    'TAB_SWITCH': ProctoringEvent.EventType.TAB_BLUR,
    'NO_FACE': ProctoringEvent.EventType.NO_FACE_DETECTED,
    'MULTIPLE_FACES': ProctoringEvent.EventType.MULTIPLE_FACES_DETECTED,
}


class ProctoringEventCreateSerializer(serializers.Serializer):
    attempt_id = serializers.IntegerField(required=True)
    event_type = serializers.CharField(required=True)
    details = serializers.JSONField(required=False, default=dict)

    def validate_event_type(self, value):
        canonical = EVENT_TYPE_ALIASES.get(value, value)
        valid_choices = [c[0] for c in ProctoringEvent.EventType.choices]
        if canonical not in valid_choices:
            raise serializers.ValidationError(
                f"Invalid event_type '{value}'. Valid choices: {valid_choices}"
            )
        return canonical
