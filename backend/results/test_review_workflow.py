from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam, Question, Option
from attempts.models import ExamAttempt, StudentAnswer
from results.models import ExamResult, ReviewHistory

User = get_user_model()


class FacultyReviewAndIsolationWorkflowTests(APITestCase):
    def setUp(self):
        self.now = timezone.now()
        # Faculty 1 (Creator)
        self.faculty1 = User.objects.create_user(
            username='prof_oak',
            email='oak@college.edu',
            password='Password@123',
            role=User.Role.FACULTY
        )
        # Faculty 2 (Unrelated)
        self.faculty2 = User.objects.create_user(
            username='prof_elm',
            email='elm@college.edu',
            password='Password@123',
            role=User.Role.FACULTY
        )
        # Student A
        self.student_a = User.objects.create_user(
            username='student_alice',
            email='alice@college.edu',
            password='Password@123',
            role=User.Role.STUDENT
        )
        # Student B
        self.student_b = User.objects.create_user(
            username='student_bob',
            email='bob@college.edu',
            password='Password@123',
            role=User.Role.STUDENT
        )

        # Exam with 1 MCQ (5 marks) and 1 Descriptive (10 marks)
        self.exam = Exam.objects.create(
            title='Advanced Computer Networks',
            description='Midterm exam',
            creator=self.faculty1,
            duration_minutes=45,
            total_marks=15.0,
            pass_marks=6.0,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=3),
            is_published=True
        )

        self.q1_mcq = Question.objects.create(
            exam=self.exam,
            question_text='Which layer does IP belong to?',
            question_type=Question.QuestionType.MCQ,
            marks=5.0,
            order=1
        )
        self.opt1 = Option.objects.create(
            question=self.q1_mcq,
            option_text='Network Layer',
            is_correct=True,
            order=1
        )
        self.opt2 = Option.objects.create(
            question=self.q1_mcq,
            option_text='Transport Layer',
            is_correct=False,
            order=2
        )

        self.q2_desc = Question.objects.create(
            exam=self.exam,
            question_text='Explain how 3-way TCP handshake establishes a connection.',
            question_type=Question.QuestionType.DESCRIPTIVE,
            marks=10.0,
            order=2
        )

    def _setup_student_submission(self, student):
        """Helper to create and submit an attempt with answers."""
        attempt = ExamAttempt.objects.create(
            student=student,
            exam=self.exam,
            expires_at=self.now + timedelta(minutes=45),
            status=ExamAttempt.AttemptStatus.SUBMITTED,
            is_completed=True,
            submitted_at=timezone.now()
        )
        # Student answers MCQ correctly
        StudentAnswer.objects.create(
            attempt=attempt,
            question=self.q1_mcq,
            selected_option=self.opt1,
            awarded_marks=5.0
        )
        # Student writes descriptive answer
        StudentAnswer.objects.create(
            attempt=attempt,
            question=self.q2_desc,
            text_response='SYN, SYN-ACK, ACK packet exchange sequences establish reliable connection.'
        )
        # ExamResult created via grading logic
        result = ExamResult.objects.create(
            attempt=attempt,
            exam=self.exam,
            student=student,
            objective_score=5.0,
            descriptive_score=0.0,
            review_status=ExamResult.ReviewStatus.PENDING_REVIEW,
            is_published=False
        )
        result.recalculate()
        return attempt, result

    # -------------------------------------------------------------
    # Scenario 3 & 4: Multi-Student Isolation & Unauthenticated Rejection
    # -------------------------------------------------------------
    def test_01_student_isolation_across_attempts_and_results(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)
        attempt_b, result_b = self._setup_student_submission(self.student_b)

        # Authenticate as Student B
        self.client.force_authenticate(user=self.student_b)

        # 1. Student B cannot access Student A's attempt
        res_att = self.client.get(f'/api/v1/student/attempts/{attempt_a.id}/')
        self.assertEqual(res_att.status_code, status.HTTP_404_NOT_FOUND)

        # 2. Student B cannot view Student A's result
        res_res = self.client.get(f'/api/v1/student/results/{attempt_a.id}/')
        self.assertEqual(res_res.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Student B cannot autosave on Student A's attempt
        res_save = self.client.post(f'/api/v1/student/attempts/{attempt_a.id}/autosave/', {
            'question_id': self.q1_mcq.id,
            'selected_option_id': self.opt2.id
        })
        self.assertEqual(res_save.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Student B cannot submit Student A's attempt
        res_sub = self.client.post(f'/api/v1/student/attempts/{attempt_a.id}/submit/')
        self.assertEqual(res_sub.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Student B cannot acknowledge Student A's feedback
        res_ack = self.client.post(f'/api/v1/results/student/results/{result_a.id}/acknowledge/')
        self.assertEqual(res_ack.status_code, status.HTTP_404_NOT_FOUND)

    def test_02_unauthenticated_requests_cannot_access_review_or_results(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)

        # Anonymous request to faculty review detail
        res1 = self.client.get(f'/api/v1/results/faculty/attempts/{attempt_a.id}/review-detail/')
        self.assertEqual(res1.status_code, status.HTTP_401_UNAUTHORIZED)

        # Anonymous request to save review
        res2 = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/save-review/', {})
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)

        # Anonymous request to student result
        res3 = self.client.get(f'/api/v1/student/results/{attempt_a.id}/')
        self.assertEqual(res3.status_code, status.HTTP_401_UNAUTHORIZED)

    # -------------------------------------------------------------
    # Scenario 5 & 6: Faculty Marks Attempt, Saves Draft, Unpublished Data Hidden
    # -------------------------------------------------------------
    def test_03_faculty_marking_draft_and_hidden_unpublished_feedback(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)

        # Faculty 1 opens review detail
        self.client.force_authenticate(user=self.faculty1)
        detail_res = self.client.get(f'/api/v1/results/faculty/attempts/{attempt_a.id}/review-detail/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data['result']['review_status'], 'PENDING_REVIEW')
        self.assertEqual(len(detail_res.data['questions']), 2)

        # Faculty saves draft review (marks descriptive answer as 8/10, sets status UNDER_REVIEW)
        save_payload = {
            'review_status': 'UNDER_REVIEW',
            'feedback': 'Good explanation of TCP sequence numbers, but mention teardown as well.',
            'internal_notes': 'Verified student explanation matches textbook chapter 4.',
            'question_marks': [
                {
                    'question_id': self.q2_desc.id,
                    'marks_awarded': 8.0,
                    'feedback': 'Clear concept presentation'
                }
            ]
        }
        save_res = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/save-review/', save_payload, format='json')
        self.assertEqual(save_res.status_code, status.HTTP_200_OK)
        self.assertEqual(save_res.data['review_status'], 'UNDER_REVIEW')
        self.assertEqual(Decimal(str(save_res.data['descriptive_score'])), Decimal('8.0'))
        self.assertEqual(Decimal(str(save_res.data['total_score'])), Decimal('13.0'))

        # Verify audit history logged
        self.assertEqual(ReviewHistory.objects.filter(result=result_a).count(), 1)

        # Verify Student A DOES NOT see unpublished marks or feedback
        self.client.force_authenticate(user=self.student_a)
        student_res = self.client.get(f'/api/v1/student/results/{attempt_a.id}/')
        self.assertEqual(student_res.status_code, status.HTTP_200_OK)
        self.assertFalse(student_res.data['is_published'])
        self.assertNotIn('marks_obtained', student_res.data)
        self.assertNotIn('total_score', student_res.data)
        self.assertNotIn('feedback', student_res.data)

    # -------------------------------------------------------------
    # Scenario 7: Publishing Feedback Makes Marks & Feedback Visible to Intended Student
    # -------------------------------------------------------------
    def test_04_publishing_feedback_makes_it_visible_to_student(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)

        # Faculty publishes review
        self.client.force_authenticate(user=self.faculty1)
        # First save complete marks
        self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/save-review/', {
            'review_status': 'REVIEWED',
            'feedback': 'Excellent overall performance in networking principles.',
            'internal_notes': 'Exam completed without integrity alerts.',
            'question_marks': [
                {'question_id': self.q2_desc.id, 'marks_awarded': 9.0}
            ]
        }, format='json')

        # Publish review
        pub_res = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/publish-review/')
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pub_res.data['review_status'], 'PUBLISHED')
        self.assertTrue(pub_res.data['is_published'])

        # Publishing again must be idempotent
        pub_res2 = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/publish-review/')
        self.assertEqual(pub_res2.status_code, status.HTTP_200_OK)

        # Student A now views result
        self.client.force_authenticate(user=self.student_a)
        student_res = self.client.get(f'/api/v1/student/results/{attempt_a.id}/')
        self.assertEqual(student_res.status_code, status.HTTP_200_OK)
        self.assertTrue(student_res.data['is_published'])
        self.assertEqual(Decimal(str(student_res.data['total_score'])), Decimal('14.0'))
        self.assertEqual(student_res.data['feedback'], 'Excellent overall performance in networking principles.')
        self.assertIsNotNone(student_res.data['published_at'])
        # Sensitive internal notes must NOT leak to student
        self.assertNotIn('internal_notes', student_res.data)

    # -------------------------------------------------------------
    # Scenario 8: Flagged Submission Remains Under Investigation
    # -------------------------------------------------------------
    def test_05_flagged_submission_remains_under_investigation(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)

        self.client.force_authenticate(user=self.faculty1)
        flag_payload = {
            'is_flagged': True,
            'flag_reason': 'Multiple face detections reported by proctoring engine at 10:14.',
            'internal_notes': 'Escalated to departmental academic integrity committee.'
        }
        flag_res = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/flag-submission/', flag_payload)
        self.assertEqual(flag_res.status_code, status.HTTP_200_OK)
        self.assertEqual(flag_res.data['review_status'], 'FLAGGED')

        # Verify marks are preserved and not zeroed out
        result_a.refresh_from_db()
        self.assertEqual(result_a.objective_score, Decimal('5.0'))
        self.assertEqual(result_a.flag_reason, 'Multiple face detections reported by proctoring engine at 10:14.')

        # Student A sees FLAGGED without seeing internal investigation notes
        self.client.force_authenticate(user=self.student_a)
        student_res = self.client.get(f'/api/v1/student/results/{attempt_a.id}/')
        self.assertEqual(student_res.status_code, status.HTTP_200_OK)
        self.assertEqual(student_res.data['review_status'], 'FLAGGED')
        self.assertNotIn('total_score', student_res.data)
        self.assertNotIn('internal_notes', student_res.data)

    # -------------------------------------------------------------
    # Scenario 9: Students Cannot Change Submitted Answers or Marks
    # -------------------------------------------------------------
    def test_06_students_cannot_modify_answers_or_marks(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)
        self.client.force_authenticate(user=self.student_a)

        # 1. Student attempts to autosave answer on submitted attempt
        save_res = self.client.post(f'/api/v1/student/attempts/{attempt_a.id}/autosave/', {
            'question_id': self.q1_mcq.id,
            'selected_option_id': self.opt2.id
        })
        self.assertEqual(save_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Student attempts to call faculty review endpoint to modify marks
        tamper_res = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/save-review/', {
            'review_status': 'PUBLISHED',
            'question_marks': [{'question_id': self.q2_desc.id, 'marks_awarded': 10.0}]
        })
        self.assertEqual(tamper_res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # Clarification Request & Acknowledgment Workflow
    # -------------------------------------------------------------
    def test_07_clarification_and_feedback_acknowledgment(self):
        attempt_a, result_a = self._setup_student_submission(self.student_a)

        # Faculty publishes review
        self.client.force_authenticate(user=self.faculty1)
        self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/save-review/', {
            'review_status': 'REVIEWED',
            'feedback': 'Scored 7 on descriptive answer.',
            'question_marks': [{'question_id': self.q2_desc.id, 'marks_awarded': 7.0}]
        }, format='json')
        self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/publish-review/')

        # Student A acknowledges feedback
        self.client.force_authenticate(user=self.student_a)
        ack_res = self.client.post(f'/api/v1/results/student/results/{result_a.id}/acknowledge/')
        self.assertEqual(ack_res.status_code, status.HTTP_200_OK)
        self.assertTrue(ack_res.data['student_acknowledged'])

        # Student A requests clarification
        clarify_res = self.client.post(f'/api/v1/results/student/results/{result_a.id}/request-clarification/', {
            'clarification_request': 'Could you please clarify why 3 marks were deducted on Q2?'
        })
        self.assertEqual(clarify_res.status_code, status.HTTP_200_OK)
        self.assertTrue(clarify_res.data['clarification_requested'])

        # Faculty responds to clarification
        self.client.force_authenticate(user=self.faculty1)
        fac_respond_res = self.client.post(f'/api/v1/results/faculty/attempts/{attempt_a.id}/respond-clarification/', {
            'clarification_response': 'Deductions were made because the SYN flood defense was omitted.'
        })
        self.assertEqual(fac_respond_res.status_code, status.HTTP_200_OK)
        self.assertEqual(fac_respond_res.data['clarification_response'], 'Deductions were made because the SYN flood defense was omitted.')
