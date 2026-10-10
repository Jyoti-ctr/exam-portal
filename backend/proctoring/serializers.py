from rest_framework import serializers
from .models import ProctoringEvent
from attempts.models import ExamAttempt


class ProctoringEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)

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
            'reviewer_notes',
        ]
        read_only_fields = ['id', 'timestamp']


class ProctoringEventCreateSerializer(serializers.Serializer):
    attempt_id = serializers.IntegerField(required=True)
    event_type = serializers.ChoiceField(choices=ProctoringEvent.EventType.choices)
    details = serializers.JSONField(required=False, default=dict)
