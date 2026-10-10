from rest_framework import serializers
from .models import ExamResult
from attempts.models import StudentAnswer


class ExamResultSerializer(serializers.ModelSerializer):
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    student_name = serializers.CharField(source='student.get_full_name', read_only=True)
    student_username = serializers.CharField(source='student.username', read_only=True)
    roll_number = serializers.CharField(source='student.student_profile.roll_number', read_only=True, default='')
    exam_total_marks = serializers.DecimalField(source='exam.total_marks', max_digits=6, decimal_places=2, read_only=True)
    exam_pass_marks = serializers.DecimalField(source='exam.pass_marks', max_digits=6, decimal_places=2, read_only=True)

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
            'feedback',
            'created_at',
        ]


class DescriptiveEvaluationPayloadSerializer(serializers.Serializer):
    answer_id = serializers.IntegerField(required=True)
    awarded_marks = serializers.DecimalField(max_digits=5, decimal_places=2, required=True)
    evaluator_comment = serializers.CharField(required=False, allow_blank=True, default='')
