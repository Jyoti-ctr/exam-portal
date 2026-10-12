from decimal import Decimal
from rest_framework import serializers
from .models import ExamResult, ReviewHistory
from attempts.models import StudentAnswer


class ReviewHistorySerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.get_full_name', read_only=True)
    reviewer_username = serializers.CharField(source='reviewer.username', read_only=True)

    class Meta:
        model = ReviewHistory
        fields = [
            'id',
            'reviewer_name',
            'reviewer_username',
            'action',
            'previous_status',
            'new_status',
            'total_score',
            'feedback',
            'notes',
            'created_at',
        ]


class ExamResultSerializer(serializers.ModelSerializer):
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_username = serializers.CharField(source='student.username', read_only=True)
    roll_number = serializers.CharField(source='student.student_profile.roll_number', read_only=True, default='')
    exam_total_marks = serializers.DecimalField(source='exam.total_marks', max_digits=6, decimal_places=2, read_only=True)
    exam_pass_marks = serializers.DecimalField(source='exam.pass_marks', max_digits=6, decimal_places=2, read_only=True)
    review_status_display = serializers.CharField(source='get_review_status_display', read_only=True)
    history = ReviewHistorySerializer(source='review_history', many=True, read_only=True)

    class Meta:
        model = ExamResult
        fields = [
            'id',
            'attempt',
            'exam',
            'exam_title',
            'student',
            'student_name',
            'student_username',
            'roll_number',
            'objective_score',
            'descriptive_score',
            'total_score',
            'exam_total_marks',
            'exam_pass_marks',
            'percentage',
            'passed',
            'is_published',
            'review_status',
            'review_status_display',
            'feedback',
            'internal_notes',
            'flag_reason',
            'reviewed_at',
            'published_at',
            'student_acknowledged',
            'student_acknowledged_at',
            'student_acknowledgment_notes',
            'clarification_requested',
            'clarification_request_text',
            'clarification_request_at',
            'clarification_response_text',
            'clarification_responded_at',
            'created_at',
            'history',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = request.user if request else None

        # Privacy Enforcement:
        # If student is viewing, strictly hide internal faculty notes, flag reasons, and unreleased scores/feedback
        if user and not (user.is_faculty or user.is_staff or user.is_superuser):
            data.pop('internal_notes', None)
            if not instance.is_published:
                data.pop('feedback', None)
                data.pop('history', None)
                data.pop('flag_reason', None)
                data.pop('objective_score', None)
                data.pop('descriptive_score', None)
                data.pop('total_score', None)
                data.pop('percentage', None)
                data.pop('passed', None)
        return data


class DescriptiveEvaluationPayloadSerializer(serializers.Serializer):
    answer_id = serializers.IntegerField(required=True)
    awarded_marks = serializers.DecimalField(max_digits=5, decimal_places=2, required=True)
    evaluator_comment = serializers.CharField(required=False, allow_blank=True, default='')


class ReviewSubmissionPayloadSerializer(serializers.Serializer):
    """
    Payload for faculty saving draft review, completing review, or publishing review.
    """
    review_status = serializers.ChoiceField(
        choices=ExamResult.ReviewStatus.choices,
        required=False
    )
    descriptive_marks = serializers.DictField(
        child=serializers.DecimalField(max_digits=5, decimal_places=2),
        required=False,
        default=dict
    )
    question_marks = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list
    )
    answer_comments = serializers.DictField(
        child=serializers.CharField(allow_blank=True),
        required=False,
        default=dict
    )
    faculty_feedback = serializers.CharField(required=False, allow_blank=True, default='')
    feedback = serializers.CharField(required=False, allow_blank=True, default='')
    internal_notes = serializers.CharField(required=False, allow_blank=True, default='')
    flag_reason = serializers.CharField(required=False, allow_blank=True, default='')


class FlagSubmissionPayloadSerializer(serializers.Serializer):
    flag_reason = serializers.CharField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ClarificationResponsePayloadSerializer(serializers.Serializer):
    response_text = serializers.CharField(required=False, allow_blank=True, default='')
    clarification_response = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        txt = attrs.get('response_text') or attrs.get('clarification_response')
        if not txt:
            raise serializers.ValidationError("Clarification response cannot be empty.")
        attrs['response_text'] = txt
        return attrs
