from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from results.models import ExamResult
from exams.models import Question


def grade_attempt(attempt):
    """
    Evaluates all objective questions for a submitted exam attempt.
    Supports MCQ, Multiple Select, True/False, Numerical, Matching, Blanks, Short Answer.
    Descriptive and Code questions are left for faculty review.
    Creates or updates the ExamResult record.
    """
    with transaction.atomic():
        exam = attempt.exam
        questions = exam.questions.all().prefetch_related('options')
        
        # Build answer map: question_id -> StudentAnswer
        answers = {ans.question_id: ans for ans in attempt.answers.select_related('selected_option').all()}

        total_objective = Decimal('0.0')

        for q in questions:
            student_ans = answers.get(q.id)
            if not student_ans:
                continue

            marks = Decimal(str(q.marks))
            neg_marks = Decimal(str(q.negative_marks))
            ans_data = student_ans.answer_data or {}

            # 1. Multiple Choice (Single Answer)
            if q.question_type == Question.QuestionType.MCQ:
                if not student_ans.selected_option:
                    continue
                if student_ans.selected_option.is_correct:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 2. Multiple Select (Multiple Answers)
            elif q.question_type == Question.QuestionType.MULTIPLE_SELECT:
                selected_ids = ans_data.get('selected_option_ids', [])
                if not selected_ids and student_ans.selected_option_id:
                    selected_ids = [student_ans.selected_option_id]
                if not selected_ids:
                    continue

                correct_ids = set(q.options.filter(is_correct=True).values_list('id', flat=True))
                student_set = set(int(i) for i in selected_ids)
                if student_set == correct_ids:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 3. True or False
            elif q.question_type == Question.QuestionType.TRUE_FALSE:
                if not student_ans.selected_option:
                    continue
                if student_ans.selected_option.is_correct:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 4. Numerical Answer
            elif q.question_type == Question.QuestionType.NUMERICAL:
                raw_val = ans_data.get('numerical_value')
                if raw_val is None or str(raw_val).strip() == '':
                    raw_val = student_ans.text_response
                if raw_val is None or str(raw_val).strip() == '':
                    continue

                try:
                    student_num = float(raw_val)
                    target_num = float(q.correct_answer_data.get('value', 0))
                    tolerance = abs(float(q.correct_answer_data.get('tolerance', 0)))
                    if abs(student_num - target_num) <= tolerance:
                        student_ans.awarded_marks = marks
                        total_objective += marks
                    else:
                        student_ans.awarded_marks = -neg_marks
                        total_objective -= neg_marks
                except (ValueError, TypeError):
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 5. Fill in the Blanks
            elif q.question_type == Question.QuestionType.FILL_IN_BLANKS:
                student_blanks = ans_data.get('blanks', ans_data.get('blank_answers', []))
                if not student_blanks and student_ans.text_response:
                    student_blanks = [b.strip() for b in student_ans.text_response.split(',')]
                if not student_blanks or all(not str(b).strip() for b in student_blanks):
                    continue

                correct_blanks = q.correct_answer_data.get('blanks', [])
                all_correct = True
                if len(student_blanks) < len(correct_blanks):
                    all_correct = False
                else:
                    for idx, expected in enumerate(correct_blanks):
                        st_val = str(student_blanks[idx]).strip().lower() if idx < len(student_blanks) else ''
                        if isinstance(expected, dict):
                            expected_list = [str(e).strip().lower() for e in expected.get('accepted', [expected.get('answer', '')])]
                            if st_val not in expected_list:
                                all_correct = False
                                break
                        elif isinstance(expected, list):
                            expected_list = [str(e).strip().lower() for e in expected]
                            if st_val not in expected_list:
                                all_correct = False
                                break
                        else:
                            if st_val != str(expected).strip().lower():
                                all_correct = False
                                break

                if all_correct:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 6. Matching
            elif q.question_type == Question.QuestionType.MATCHING:
                student_pairs = ans_data.get('matches', ans_data.get('pairs', {}))
                if isinstance(student_pairs, list):
                    # Convert list of {left, right} to dict
                    student_pairs = {p.get('left'): p.get('right') for p in student_pairs if isinstance(p, dict)}
                if not student_pairs:
                    continue

                correct_pairs_list = q.correct_answer_data.get('pairs', [])
                if isinstance(correct_pairs_list, dict):
                    correct_dict = correct_pairs_list
                else:
                    correct_dict = {p.get('left'): p.get('right') for p in correct_pairs_list if isinstance(p, dict)}
                
                is_match = True
                for left_key, right_val in correct_dict.items():
                    if str(student_pairs.get(left_key, '')).strip().lower() != str(right_val).strip().lower():
                        is_match = False
                        break

                if is_match and len(correct_dict) > 0:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 7. Short Answer (Objective or Manual)
            elif q.question_type == Question.QuestionType.SHORT_ANSWER:
                if q.manual_grading:
                    # Leave for faculty review
                    continue
                accepted = [str(a).strip().lower() for a in q.correct_answer_data.get('accepted_answers', [])]
                st_text = (student_ans.text_response or ans_data.get('text_response') or '').strip().lower()
                if not st_text:
                    continue

                if st_text in accepted:
                    student_ans.awarded_marks = marks
                    total_objective += marks
                else:
                    student_ans.awarded_marks = -neg_marks
                    total_objective -= neg_marks
                student_ans.save()

            # 8. Image-Based Question
            elif q.question_type == Question.QuestionType.IMAGE_BASED:
                if q.options.exists():
                    if not student_ans.selected_option:
                        continue
                    if student_ans.selected_option.is_correct:
                        student_ans.awarded_marks = marks
                        total_objective += marks
                    else:
                        student_ans.awarded_marks = -neg_marks
                        total_objective -= neg_marks
                    student_ans.save()
                elif q.manual_grading:
                    continue

            # 9. Descriptive & Code: Manual Grading
            elif q.question_type in [Question.QuestionType.DESCRIPTIVE, Question.QuestionType.CODE]:
                # Leave awarded_marks None for faculty marking
                continue

        # Total objective score cannot be negative
        if total_objective < Decimal('0.0'):
            total_objective = Decimal('0.0')

        has_manual = exam.questions.filter(
            question_type__in=[Question.QuestionType.DESCRIPTIVE, Question.QuestionType.CODE]
        ).exists() or exam.questions.filter(manual_grading=True).exists()

        initial_status = ExamResult.ReviewStatus.PENDING_REVIEW if has_manual else ExamResult.ReviewStatus.SUBMITTED

        existing = ExamResult.objects.filter(attempt=attempt).first()
        if existing:
            existing.objective_score = total_objective
            if existing.review_status in [ExamResult.ReviewStatus.SUBMITTED, ExamResult.ReviewStatus.PENDING_REVIEW]:
                existing.review_status = initial_status
            existing.recalculate()
            return existing
        else:
            result = ExamResult.objects.create(
                attempt=attempt,
                exam=exam,
                student=attempt.student,
                objective_score=total_objective,
                is_published=False,
                review_status=initial_status,
            )
            result.recalculate()
            return result


# Maintain backwards compatibility
grade_mcq_attempt = grade_attempt
