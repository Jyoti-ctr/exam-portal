from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from accounts.permissions import IsStudentUser, IsFacultyUser
from exams.models import Exam, Question
from attempts.models import ExamAttempt, StudentAnswer
from .models import ExamResult, ReviewHistory
from .serializers import (
    ExamResultSerializer,
    DescriptiveEvaluationPayloadSerializer,
    ReviewSubmissionPayloadSerializer,
    FlagSubmissionPayloadSerializer,
    ClarificationResponsePayloadSerializer,
)


# ==========================================
# STUDENT RESULT & FEEDBACK ENDPOINTS
# ==========================================

class StudentExamResultView(APIView):
    """
    GET: Student views the result of an exam attempt.
    Enforces the rule: results are HIDDEN until faculty explicitly publishes them.
    Unpublished marks and confidential internal notes are never returned.
    """
    permission_classes = [IsStudentUser]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(ExamAttempt, id=attempt_id, student=request.user)
        result = getattr(attempt, 'result', None)

        if not result:
            return Response({
                'is_published': False,
                'review_status': ExamResult.ReviewStatus.SUBMITTED,
                'message': 'Your attempt has been submitted and is currently queued for grading.'
            }, status=status.HTTP_200_OK)

        if not result.is_published:
            return Response({
                'is_published': False,
                'review_status': result.review_status,
                'review_status_display': result.get_review_status_display(),
                'message': f"Your submission status is currently '{result.get_review_status_display()}'. Scores and instructor feedback will be visible once published."
            }, status=status.HTTP_200_OK)

        serializer = ExamResultSerializer(result, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class StudentPublishedResultsListView(generics.ListAPIView):
    """
    GET: Returns list of all submission records for the student.
    Published results show official grades and instructor feedback.
    Unpublished results show submission status and pending evaluation state, with marks hidden.
    """
    permission_classes = [IsStudentUser]
    serializer_class = ExamResultSerializer

    def get_queryset(self):
        return ExamResult.objects.filter(
            student=self.request.user
        ).select_related('exam', 'student', 'attempt').order_by('-created_at')


class StudentAcknowledgeFeedbackView(APIView):
    """
    POST: Student acknowledges published feedback from their instructor.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, result_id):
        result = get_object_or_404(ExamResult, id=result_id, student=request.user)
        if not result.is_published:
            return Response(
                {'error': 'Cannot acknowledge unpublished results.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        notes = request.data.get('notes', '').strip()
        result.student_acknowledged = True
        result.student_acknowledged_at = timezone.now()
        result.student_acknowledgment_notes = notes
        result.save()

        return Response({
            'status': 'success',
            'message': 'Feedback successfully acknowledged.',
            'student_acknowledged': True,
            'acknowledged_at': result.student_acknowledged_at
        }, status=status.HTTP_200_OK)


class StudentRequestClarificationView(APIView):
    """
    POST: Student requests clarification on published results/feedback.
    Original submission answers remain strictly immutable.
    """
    permission_classes = [IsStudentUser]

    def post(self, request, result_id):
        result = get_object_or_404(ExamResult, id=result_id, student=request.user)
        if not result.is_published:
            return Response(
                {'error': 'Cannot request clarification on unpublished results.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        message = (request.data.get('message') or request.data.get('clarification_request') or '').strip()
        if not message:
            return Response(
                {'error': 'Clarification message cannot be empty.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            result.clarification_requested = True
            result.clarification_request_text = message
            result.clarification_request_at = timezone.now()
            prev_status = result.review_status
            result.review_status = ExamResult.ReviewStatus.RETURNED_FOR_CLARIFICATION
            result.save()

            result.record_history(
                reviewer=request.user,
                action='CLARIFICATION_REQUESTED',
                prev_status=prev_status,
                new_status=ExamResult.ReviewStatus.RETURNED_FOR_CLARIFICATION,
                notes=f"Student clarification note: {message[:100]}"
            )

        return Response({
            'status': 'success',
            'message': 'Clarification request sent to instructor.',
            'clarification_requested': True,
            'review_status': result.review_status,
            'clarification_request_at': result.clarification_request_at
        }, status=status.HTTP_200_OK)


# ==========================================
# FACULTY REVIEW & MARKING WORKFLOW ENDPOINTS
# ==========================================

class FacultyExamSubmissionsListView(generics.ListAPIView):
    """
    GET: Lists all submitted student attempts for an exam with review statuses.
    """
    permission_classes = [IsFacultyUser]
    serializer_class = ExamResultSerializer

    def get_queryset(self):
        exam_id = self.kwargs['exam_id']
        exam = get_object_or_404(Exam, id=exam_id)
        if not self.request.user.is_superuser and exam.creator != self.request.user:
            return ExamResult.objects.none()
        return ExamResult.objects.filter(exam=exam).select_related('student', 'exam', 'attempt').order_by('-created_at')


class FacultyAttemptReviewDetailView(APIView):
    """
    GET: Full review workspace for an individual student attempt:
    - Questions, choices, student submitted answers
    - Current marks and question maximum marks
    - Current review status, draft feedback, confidential internal notes
    - Review audit history
    """
    permission_classes = [IsFacultyUser]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(
            ExamAttempt.objects.select_related('student', 'exam'),
            id=attempt_id
        )
        exam = attempt.exam
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        result = getattr(attempt, 'result', None)
        if not result:
            from attempts.grading import grade_mcq_attempt
            result = grade_mcq_attempt(attempt)

        questions = list(exam.questions.prefetch_related('options').all())
        answers = {a.question_id: a for a in attempt.answers.select_related('selected_option').all()}

        questions_data = []
        for q in questions:
            ans = answers.get(q.id)
            q_info = {
                'id': q.id,
                'question_text': q.question_text,
                'question_type': q.question_type,
                'marks': float(q.marks),
                'negative_marks': float(q.negative_marks),
                'order': q.order,
                'image': q.image.url if q.image else None,
                'image_url': q.image_url,
                'correct_answer_data': q.correct_answer_data,
                'question_metadata': q.question_metadata,
                'manual_grading': q.manual_grading,
                'options': [
                    {
                        'id': opt.id,
                        'option_text': opt.option_text,
                        'is_correct': opt.is_correct,
                        'is_selected': bool(ans and ans.selected_option_id == opt.id)
                    }
                    for opt in q.options.all()
                ],
                'student_answer': {
                    'id': ans.id if ans else None,
                    'selected_option_id': ans.selected_option_id if ans else None,
                    'text_response': ans.text_response if ans else '',
                    'answer_data': ans.answer_data if ans else {},
                    'awarded_marks': float(ans.awarded_marks) if ans and ans.awarded_marks is not None else None,
                    'evaluator_comment': ans.evaluator_comment if ans else '',
                    'is_marked_for_review': ans.is_marked_for_review if ans else False,
                } if ans else None
            }
            questions_data.append(q_info)

        student_prof = getattr(attempt.student, 'student_profile', None)

        return Response({
            'attempt': {
                'id': attempt.id,
                'attempt_number': attempt.attempt_number,
                'status': attempt.status,
                'started_at': attempt.started_at,
                'submitted_at': attempt.submitted_at,
                'submission_reason': attempt.submission_reason,
                'warning_count': attempt.warning_count,
                'navigation_mode': attempt.exam.navigation_mode,
                'is_completed': attempt.is_completed,
                'student_id': attempt.student_id,
                'student_username': attempt.student.username,
                'student_name': attempt.student.get_full_name() or attempt.student.username,
                'roll_number': student_prof.roll_number if student_prof else '',
                'department': student_prof.department if student_prof else '',
            },
            'exam': {
                'id': exam.id,
                'title': exam.title,
                'total_marks': float(exam.total_marks),
                'pass_marks': float(exam.pass_marks),
                'navigation_mode': exam.navigation_mode,
                'warning_threshold': exam.warning_threshold,
            },
            'result': ExamResultSerializer(result, context={'request': request}).data,
            'questions': questions_data,
        }, status=status.HTTP_200_OK)


class FacultySaveReviewView(APIView):
    """
    POST: Saves draft review or updates marks and written feedback for an attempt.
    Validates marks (cannot be negative or exceed question max marks) and preserves audit history.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, attempt_id):
        serializer = ReviewSubmissionPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attempt = get_object_or_404(
            ExamAttempt.objects.select_related('exam', 'student'),
            id=attempt_id
        )
        exam = attempt.exam
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            result = ExamResult.objects.select_for_update().filter(attempt=attempt).first()
            if not result:
                from attempts.grading import grade_mcq_attempt
                result = grade_mcq_attempt(attempt)

            prev_status = result.review_status
            new_status = serializer.validated_data.get('review_status', ExamResult.ReviewStatus.UNDER_REVIEW)

            # Update awarded marks for individual answers
            descriptive_marks = serializer.validated_data.get('descriptive_marks', {})
            question_marks = serializer.validated_data.get('question_marks', [])
            answer_comments = serializer.validated_data.get('answer_comments', {})

            for ans_id_str, marks_val in descriptive_marks.items():
                try:
                    ans_id = int(ans_id_str)
                except ValueError:
                    continue

                ans = StudentAnswer.objects.filter(id=ans_id, attempt=attempt).first()
                if ans:
                    max_m = Decimal(str(ans.question.marks))
                    m_val = Decimal(str(marks_val))
                    if m_val < Decimal('0.0') or m_val > max_m:
                        return Response(
                            {'error': f"Marks for Q{ans.question.order} must be between 0 and {max_m}."},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    ans.awarded_marks = m_val
                    if str(ans_id) in answer_comments:
                        ans.evaluator_comment = answer_comments[str(ans_id)]
                    ans.save()

            for qm in question_marks:
                q_id = qm.get('question_id')
                m_val_raw = qm.get('marks_awarded', qm.get('marks'))
                if q_id is not None and m_val_raw is not None:
                    ans = StudentAnswer.objects.filter(question_id=q_id, attempt=attempt).first()
                    if ans:
                        max_m = Decimal(str(ans.question.marks))
                        m_val = Decimal(str(m_val_raw))
                        if m_val < Decimal('0.0') or m_val > max_m:
                            return Response(
                                {'error': f"Marks for Q{ans.question.order} must be between 0 and {max_m}."},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        ans.awarded_marks = m_val
                        if 'feedback' in qm:
                            ans.evaluator_comment = qm['feedback']
                        ans.save()

            # Recalculate total descriptive/manual score
            from django.db.models import Q
            desc_answers = attempt.answers.filter(
                Q(question__question_type__in=[Question.QuestionType.DESCRIPTIVE, Question.QuestionType.CODE]) |
                Q(question__manual_grading=True),
                awarded_marks__isnull=False
            )
            total_desc = sum(a.awarded_marks for a in desc_answers)
            result.descriptive_score = total_desc

            # Update feedback & internal notes
            feedback_val = serializer.validated_data.get('faculty_feedback') or serializer.validated_data.get('feedback')
            if feedback_val:
                result.feedback = feedback_val
            if 'internal_notes' in serializer.validated_data and serializer.validated_data['internal_notes']:
                result.internal_notes = serializer.validated_data['internal_notes']
            if 'flag_reason' in serializer.validated_data and serializer.validated_data['flag_reason']:
                result.flag_reason = serializer.validated_data['flag_reason']

            result.review_status = new_status
            result.evaluated_by = request.user
            result.reviewed_at = timezone.now()
            result.recalculate()

            action_name = 'DRAFT_SAVED' if new_status != ExamResult.ReviewStatus.REVIEWED else 'REVIEW_COMPLETED'
            result.record_history(
                reviewer=request.user,
                action=action_name,
                prev_status=prev_status,
                new_status=new_status,
                notes=result.internal_notes
            )

        return Response(ExamResultSerializer(result, context={'request': request}).data, status=status.HTTP_200_OK)


class FacultyPublishReviewView(APIView):
    """
    POST: Finalizes and publishes review for a student attempt.
    Makes marks and faculty feedback visible to the student.
    Idempotent.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(
            ExamAttempt.objects.select_related('exam', 'student'),
            id=attempt_id
        )
        exam = attempt.exam
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            result = ExamResult.objects.select_for_update().filter(attempt=attempt).first()
            if not result:
                from attempts.grading import grade_mcq_attempt
                result = grade_mcq_attempt(attempt)

            prev_status = result.review_status
            result.is_published = True
            result.review_status = ExamResult.ReviewStatus.PUBLISHED
            result.published_at = timezone.now()
            result.evaluated_by = request.user
            result.recalculate()

            result.record_history(
                reviewer=request.user,
                action='PUBLISHED',
                prev_status=prev_status,
                new_status=ExamResult.ReviewStatus.PUBLISHED,
                notes='Official results published to student'
            )

        return Response(ExamResultSerializer(result, context={'request': request}).data, status=status.HTTP_200_OK)


class FacultyFlagSubmissionView(APIView):
    """
    POST: Flags a student submission for integrity or academic investigation.
    Does not automatically zero marks or claim cheating.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, attempt_id):
        serializer = FlagSubmissionPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attempt = get_object_or_404(
            ExamAttempt.objects.select_related('exam'),
            id=attempt_id
        )
        exam = attempt.exam
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            result = ExamResult.objects.select_for_update().filter(attempt=attempt).first()
            if not result:
                from attempts.grading import grade_mcq_attempt
                result = grade_mcq_attempt(attempt)

            prev_status = result.review_status
            reason = serializer.validated_data['flag_reason']
            notes = serializer.validated_data.get('notes', '')

            result.review_status = ExamResult.ReviewStatus.FLAGGED
            result.flag_reason = reason
            if notes:
                result.internal_notes = (result.internal_notes + "\n" + notes).strip()
            result.save()

            result.record_history(
                reviewer=request.user,
                action='FLAGGED',
                prev_status=prev_status,
                new_status=ExamResult.ReviewStatus.FLAGGED,
                notes=reason
            )

        return Response(ExamResultSerializer(result, context={'request': request}).data, status=status.HTTP_200_OK)


class FacultyRespondClarificationView(APIView):
    """
    POST: Faculty responds to student's clarification inquiry.
    """
    permission_classes = [IsFacultyUser]

    def post(self, request, attempt_id):
        serializer = ClarificationResponsePayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        attempt = get_object_or_404(ExamAttempt.objects.select_related('exam'), id=attempt_id)
        exam = attempt.exam
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            result = ExamResult.objects.select_for_update().filter(attempt=attempt).first()
            if not result:
                return Response({'error': 'Result not found'}, status=status.HTTP_404_NOT_FOUND)

            prev_status = result.review_status
            resp = serializer.validated_data['response_text']
            result.clarification_response_text = resp
            result.clarification_responded_at = timezone.now()
            result.review_status = ExamResult.ReviewStatus.PUBLISHED
            result.save()

            result.record_history(
                reviewer=request.user,
                action='CLARIFICATION_RESPONDED',
                prev_status=prev_status,
                new_status=ExamResult.ReviewStatus.PUBLISHED,
                notes=resp[:100]
            )

        data = ExamResultSerializer(result, context={'request': request}).data
        data['clarification_response'] = resp
        return Response(data, status=status.HTTP_200_OK)


# ==========================================
# LEGACY COMPATIBILITY ENDPOINTS
# ==========================================

class FacultyExamResultsListView(generics.ListAPIView):
    permission_classes = [IsFacultyUser]
    serializer_class = ExamResultSerializer

    def get_queryset(self):
        exam_id = self.kwargs['exam_id']
        exam = get_object_or_404(Exam, id=exam_id)
        if not self.request.user.is_superuser and exam.creator != self.request.user:
            return ExamResult.objects.none()
        return ExamResult.objects.filter(exam=exam).select_related('student', 'exam', 'attempt')


class FacultyEvaluateDescriptiveView(APIView):
    permission_classes = [IsFacultyUser]

    def post(self, request):
        serializer = DescriptiveEvaluationPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answer_id = serializer.validated_data['answer_id']
        awarded_marks = serializer.validated_data['awarded_marks']
        feedback = serializer.validated_data.get('evaluator_comment', '')

        with transaction.atomic():
            answer = get_object_or_404(StudentAnswer, id=answer_id)
            attempt = answer.attempt
            exam = attempt.exam

            if not request.user.is_superuser and exam.creator != request.user:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

            if awarded_marks > answer.question.marks or awarded_marks < Decimal('0.0'):
                return Response(
                    {'error': f'Marks must be between 0 and maximum {answer.question.marks}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            answer.awarded_marks = awarded_marks
            answer.evaluator_comment = feedback
            answer.save()

            descriptive_answers = attempt.answers.filter(
                question__question_type=Question.QuestionType.DESCRIPTIVE,
                awarded_marks__isnull=False
            )
            total_descriptive = sum(a.awarded_marks for a in descriptive_answers)

            result = attempt.result
            result.descriptive_score = total_descriptive
            result.evaluated_by = request.user
            result.recalculate()

        return Response(ExamResultSerializer(result, context={'request': request}).data, status=status.HTTP_200_OK)


class FacultyPublishResultsView(APIView):
    permission_classes = [IsFacultyUser]

    def post(self, request, exam_id):
        exam = get_object_or_404(Exam, id=exam_id)
        if not request.user.is_superuser and exam.creator != request.user:
            return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)

        publish = request.data.get('is_published', True)
        now = timezone.now() if publish else None
        target_status = ExamResult.ReviewStatus.PUBLISHED if publish else ExamResult.ReviewStatus.REVIEWED

        updated_count = ExamResult.objects.filter(exam=exam).update(
            is_published=publish,
            published_at=now,
            review_status=target_status
        )

        return Response({
            'status': 'success',
            'is_published': publish,
            'updated_count': updated_count,
            'message': f"Results {'published to students' if publish else 'hidden from students'} successfully."
        }, status=status.HTTP_200_OK)
