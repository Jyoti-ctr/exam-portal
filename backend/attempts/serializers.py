from rest_framework import serializers
from .models import ExamAttempt, StudentAnswer
from exams.serializers import QuestionStudentSerializer, OptionStudentSerializer
from exams.models import Question


class StudentAnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.IntegerField(source='question.id', read_only=True)
    selected_option_id = serializers.IntegerField(source='selected_option.id', read_only=True, allow_null=True)

    class Meta:
        model = StudentAnswer
        fields = [
            'id',
            'question_id',
            'selected_option_id',
            'text_response',
            'answer_data',
            'is_marked_for_review',
            'updated_at',
        ]


class AutosavePayloadSerializer(serializers.Serializer):
    question_id = serializers.IntegerField(required=True)
    selected_option_id = serializers.IntegerField(required=False, allow_null=True)
    text_response = serializers.CharField(required=False, allow_blank=True, default='')
    answer_data = serializers.DictField(required=False, default=dict)
    is_marked_for_review = serializers.BooleanField(required=False, default=False)


class NavigationAdvancePayloadSerializer(serializers.Serializer):
    """
    Validates requests to advance to next question in FORWARD_ONLY mode.
    """
    target_index = serializers.IntegerField(required=True)


class ExamAttemptDetailSerializer(serializers.ModelSerializer):
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    exam_description = serializers.CharField(source='exam.description', read_only=True)
    duration_minutes = serializers.IntegerField(source='exam.duration_minutes', read_only=True)
    total_marks = serializers.DecimalField(source='exam.total_marks', max_digits=6, decimal_places=2, read_only=True)
    enable_proctoring = serializers.BooleanField(source='exam.enable_proctoring', read_only=True)
    navigation_mode = serializers.CharField(source='exam.navigation_mode', read_only=True)
    warning_threshold = serializers.IntegerField(source='exam.warning_threshold', read_only=True)
    max_warnings = serializers.IntegerField(source='exam.warning_threshold', read_only=True)
    is_camera_mandatory = serializers.BooleanField(source='exam.is_camera_mandatory', read_only=True)
    monitored_warning_categories = serializers.ListField(source='exam.monitored_warning_categories', read_only=True)
    remaining_seconds = serializers.IntegerField(read_only=True)
    saved_answers = StudentAnswerSerializer(source='answers', many=True, read_only=True)
    questions = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            'id',
            'exam',
            'exam_title',
            'exam_description',
            'duration_minutes',
            'total_marks',
            'enable_proctoring',
            'navigation_mode',
            'warning_threshold',
            'max_warnings',
            'warning_count',
            'submission_reason',
            'is_camera_mandatory',
            'monitored_warning_categories',
            'current_question_index',
            'highest_question_index',
            'attempt_number',
            'status',
            'started_at',
            'expires_at',
            'submitted_at',
            'remaining_seconds',
            'is_completed',
            'saved_answers',
            'questions',
        ]

    def get_questions(self, obj):
        qs = obj.exam.questions.all().prefetch_related('options')
        if obj.exam.shuffle_questions:
            # Deterministic shuffle seeded by attempt ID so order remains consistent across student refreshes!
            import random
            rng = random.Random(obj.id)
            qs_list = list(qs)
            rng.shuffle(qs_list)
            data = QuestionStudentSerializer(qs_list, many=True).data
        else:
            data = QuestionStudentSerializer(qs, many=True).data

        if obj.exam.shuffle_options:
            import random
            for q_data in data:
                rng = random.Random(obj.id + q_data['id'])
                rng.shuffle(q_data['options'])

        return data
