from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from results.models import ExamResult
from exams.models import Question


def grade_mcq_attempt(attempt):
    """
    Evaluates all MCQ questions for a submitted exam attempt.
    Creates or updates the ExamResult record.
    """
    with transaction.atomic():
        exam = attempt.exam
        mcq_questions = exam.questions.filter(question_type=Question.QuestionType.MCQ).prefetch_related('options')
        
        # Build answer map: question_id -> StudentAnswer
        answers = {ans.question_id: ans for ans in attempt.answers.select_related('selected_option').all()}

        total_objective = Decimal('0.0')

        for q in mcq_questions:
            student_ans = answers.get(q.id)
            if not student_ans or not student_ans.selected_option:
                # Question not attempted
                continue

            if student_ans.selected_option.is_correct:
                awarded = Decimal(str(q.marks))
                student_ans.awarded_marks = awarded
                total_objective += awarded
            else:
                deduction = Decimal(str(q.negative_marks))
                student_ans.awarded_marks = -deduction
                total_objective -= deduction

            student_ans.save()

        # Score cannot be negative
        if total_objective < Decimal('0.0'):
            total_objective = Decimal('0.0')

        result, _ = ExamResult.objects.update_or_create(
            attempt=attempt,
            defaults={
                'exam': exam,
                'student': attempt.student,
                'objective_score': total_objective,
                'is_published': False,  # Kept private until faculty release
            }
        )
        result.recalculate()
        return result
