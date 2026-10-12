from rest_framework import serializers
from .models import Exam, Question, Option


# ==========================================
# FACULTY SERIALIZERS (Includes Answers)
# ==========================================

class OptionFacultySerializer(serializers.ModelSerializer):
    class Meta:
        model = Option
        fields = ['id', 'option_text', 'is_correct', 'order']


class QuestionFacultySerializer(serializers.ModelSerializer):
    options = OptionFacultySerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            'id',
            'exam',
            'question_text',
            'question_type',
            'marks',
            'negative_marks',
            'order',
            'options',
        ]
        extra_kwargs = {
            'exam': {'required': False}
        }

    def create(self, validated_data):
        options_data = validated_data.pop('options', [])
        question = Question.objects.create(**validated_data)
        for opt in options_data:
            Option.objects.create(question=question, **opt)
        return question

    def update(self, instance, validated_data):
        options_data = validated_data.pop('options', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if options_data is not None:
            # Refresh options
            instance.options.all().delete()
            for opt in options_data:
                Option.objects.create(question=instance, **opt)
        return instance


class ExamFacultySerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(source='questions.count', read_only=True)
    creator_name = serializers.CharField(source='creator.get_full_name', read_only=True)

    class Meta:
        model = Exam
        fields = [
            'id',
            'title',
            'description',
            'duration_minutes',
            'total_marks',
            'pass_marks',
            'start_window',
            'end_window',
            'max_attempts',
            'allow_retake',
            'shuffle_questions',
            'shuffle_options',
            'enable_proctoring',
            'is_published',
            'assigned_students',
            'question_count',
            'creator_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'creator_name', 'question_count']

    def validate(self, attrs):
        start = attrs.get('start_window', getattr(self.instance, 'start_window', None))
        end = attrs.get('end_window', getattr(self.instance, 'end_window', None))
        if start and end and start >= end:
            raise serializers.ValidationError("End window must be strictly after start window.")
        return attrs


# ==========================================
# STUDENT SERIALIZERS (Correct answers stripped)
# ==========================================

class OptionStudentSerializer(serializers.ModelSerializer):
    """
    CRITICAL: is_correct is intentionally excluded to prevent answer leaking.
    """
    class Meta:
        model = Option
        fields = ['id', 'option_text', 'order']


class QuestionStudentSerializer(serializers.ModelSerializer):
    options = OptionStudentSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            'id',
            'question_text',
            'question_type',
            'marks',
            'negative_marks',
            'order',
            'options',
        ]


class ExamStudentSerializer(serializers.ModelSerializer):
    has_attempt = serializers.SerializerMethodField()
    attempt_status = serializers.SerializerMethodField()
    attempts_count = serializers.SerializerMethodField()
    can_attempt = serializers.SerializerMethodField()
    active_attempt_id = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            'id',
            'title',
            'description',
            'duration_minutes',
            'total_marks',
            'pass_marks',
            'start_window',
            'end_window',
            'max_attempts',
            'allow_retake',
            'enable_proctoring',
            'has_attempt',
            'attempt_status',
            'attempts_count',
            'can_attempt',
            'active_attempt_id',
        ]

    def get_attempts_count(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0
        return obj.attempts.filter(student=request.user).count()

    def get_has_attempt(self, obj):
        return self.get_attempts_count(obj) > 0

    def get_attempt_status(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        attempt = obj.attempts.filter(student=request.user).order_by('-started_at').first()
        return attempt.status if attempt else None

    def get_active_attempt_id(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        from attempts.models import ExamAttempt
        active = obj.attempts.filter(student=request.user, status=ExamAttempt.AttemptStatus.IN_PROGRESS).first()
        return active.id if active else None

    def get_can_attempt(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        from attempts.models import ExamAttempt
        if obj.attempts.filter(student=request.user, status=ExamAttempt.AttemptStatus.IN_PROGRESS).exists():
            return True
        count = self.get_attempts_count(obj)
        if count == 0:
            return True
        return obj.allow_retake and count < obj.max_attempts

