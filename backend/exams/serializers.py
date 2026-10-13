from decimal import Decimal
import random
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
            'image',
            'image_url',
            'correct_answer_data',
            'question_metadata',
            'manual_grading',
            'options',
        ]
        extra_kwargs = {
            'exam': {'required': False}
        }

    def validate(self, attrs):
        q_type = attrs.get('question_type', getattr(self.instance, 'question_type', Question.QuestionType.MCQ))
        marks = attrs.get('marks', getattr(self.instance, 'marks', Decimal('1.0')))
        neg_marks = attrs.get('negative_marks', getattr(self.instance, 'negative_marks', Decimal('0.0')))
        correct_data = attrs.get('correct_answer_data', getattr(self.instance, 'correct_answer_data', {}))
        manual = attrs.get('manual_grading', getattr(self.instance, 'manual_grading', False))
        options_data = self.initial_data.get('options', [])

        if marks <= Decimal('0.0'):
            raise serializers.ValidationError({'marks': 'Marks must be greater than 0.'})
        if neg_marks < Decimal('0.0'):
            raise serializers.ValidationError({'negative_marks': 'Negative marks cannot be negative.'})

        # Validate objective questions
        if q_type == Question.QuestionType.MCQ:
            valid_opts = [o for o in options_data if o.get('option_text', '').strip()]
            if len(valid_opts) < 2:
                raise serializers.ValidationError({'options': 'Multiple Choice questions require at least 2 options.'})
            correct_opts = [o for o in valid_opts if o.get('is_correct')]
            if len(correct_opts) != 1:
                raise serializers.ValidationError({'options': 'Multiple Choice (Single Answer) must have exactly one correct option.'})

        elif q_type == Question.QuestionType.MULTIPLE_SELECT:
            valid_opts = [o for o in options_data if o.get('option_text', '').strip()]
            if len(valid_opts) < 2:
                raise serializers.ValidationError({'options': 'Multiple Select questions require at least 2 options.'})
            correct_opts = [o for o in valid_opts if o.get('is_correct')]
            if len(correct_opts) < 1:
                raise serializers.ValidationError({'options': 'Multiple Select must have at least one correct option designated.'})

        elif q_type == Question.QuestionType.TRUE_FALSE:
            valid_opts = [o for o in options_data if o.get('option_text', '').strip()]
            if len(valid_opts) != 2:
                raise serializers.ValidationError({'options': 'True or False questions require exactly 2 options (True and False).'})
            correct_opts = [o for o in valid_opts if o.get('is_correct')]
            if len(correct_opts) != 1:
                raise serializers.ValidationError({'options': 'True or False questions must specify exactly one correct choice.'})

        elif q_type == Question.QuestionType.NUMERICAL:
            val = correct_data.get('value')
            if val is None or str(val).strip() == '':
                raise serializers.ValidationError({'correct_answer_data': 'Numerical questions require a target numeric "value".'})
            try:
                float(val)
            except (ValueError, TypeError):
                raise serializers.ValidationError({'correct_answer_data': 'Target numerical value must be a valid number.'})

        elif q_type == Question.QuestionType.FILL_IN_BLANKS:
            blanks = correct_data.get('blanks', [])
            if not blanks or not isinstance(blanks, list):
                raise serializers.ValidationError({'correct_answer_data': 'Fill in the blanks requires answer keys for at least one blank.'})

        elif q_type == Question.QuestionType.MATCHING:
            pairs = correct_data.get('pairs', [])
            if not pairs or len(pairs) < 2:
                raise serializers.ValidationError({'correct_answer_data': 'Matching questions require at least 2 matching pairs.'})

        elif q_type == Question.QuestionType.SHORT_ANSWER:
            if not manual and not correct_data.get('accepted_answers'):
                raise serializers.ValidationError({'correct_answer_data': 'Objectively graded short answer questions require at least one accepted answer, or enable manual grading.'})

        return attrs

    def create(self, validated_data):
        options_data = validated_data.pop('options', [])
        # Default manual grading for descriptive and code
        q_type = validated_data.get('question_type')
        if q_type in [Question.QuestionType.DESCRIPTIVE, Question.QuestionType.CODE] and 'manual_grading' not in validated_data:
            validated_data['manual_grading'] = True

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
            'navigation_mode',
            'warning_threshold',
            'is_camera_mandatory',
            'monitored_warning_categories',
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

        is_published = attrs.get('is_published', getattr(self.instance, 'is_published', False))
        nav_mode = attrs.get('navigation_mode', getattr(self.instance, 'navigation_mode', None))
        if is_published:
            if not nav_mode or nav_mode not in Exam.NavigationMode.values:
                raise serializers.ValidationError("Faculty must select a required Question Navigation setting (Forward Only or Forward and Backward) before publishing the exam.")

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
    question_metadata = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            'id',
            'question_text',
            'question_type',
            'marks',
            'negative_marks',
            'order',
            'image',
            'image_url',
            'question_metadata',
            'options',
        ]

    def get_question_metadata(self, obj):
        """
        Sanitize question_metadata to ensure NO answer keys are leaked.
        For matching questions, supply separated left items and shuffled right items.
        """
        meta = dict(obj.question_metadata or {})
        # Never leak correct answer data if mistakenly placed in metadata
        meta.pop('pairs', None)
        meta.pop('correct_pairs', None)
        meta.pop('accepted_answers', None)
        meta.pop('blanks', None)
        meta.pop('value', None)

        if obj.question_type == Question.QuestionType.MATCHING:
            # Extract left and right items from correct_answer_data safely
            correct_pairs = obj.correct_answer_data.get('pairs', [])
            left_items = [p.get('left') for p in correct_pairs if p.get('left')]
            right_items = [p.get('right') for p in correct_pairs if p.get('right')]
            # Deterministically or stably shuffle right items so student can choose matches
            shuffled_right = list(right_items)
            random.Random(obj.id).shuffle(shuffled_right)
            meta['left_items'] = left_items
            meta['right_items'] = shuffled_right

        elif obj.question_type == Question.QuestionType.FILL_IN_BLANKS:
            correct_blanks = obj.correct_answer_data.get('blanks', [])
            meta['blanks_count'] = len(correct_blanks)

        return meta


class ExamStudentSerializer(serializers.ModelSerializer):
    has_attempt = serializers.SerializerMethodField()
    attempt_status = serializers.SerializerMethodField()
    attempts_count = serializers.SerializerMethodField()
    can_attempt = serializers.SerializerMethodField()
    active_attempt_id = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    has_negative_marking = serializers.SerializerMethodField()

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
            'navigation_mode',
            'warning_threshold',
            'is_camera_mandatory',
            'monitored_warning_categories',
            'max_attempts',
            'allow_retake',
            'enable_proctoring',
            'has_attempt',
            'attempt_status',
            'attempts_count',
            'can_attempt',
            'active_attempt_id',
            'question_count',
            'has_negative_marking',
        ]

    def get_question_count(self, obj):
        return obj.questions.count()

    def get_has_negative_marking(self, obj):
        return obj.questions.filter(negative_marks__gt=0).exists()

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

