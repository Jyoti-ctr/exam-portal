from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from exams.models import Exam
from attempts.models import ExamAttempt
from proctoring.models import ProctoringEvent

User = get_user_model()


class ProctoringEventAPITests(APITestCase):
    def setUp(self):
        self.faculty = User.objects.create_user(
            username='prof_oak_proc',
            email='oak_proc@example.com',
            password='password123',
            role=User.Role.FACULTY
        )
        self.student = User.objects.create_user(
            username='ash_ketchum_proc',
            email='ash_proc@example.com',
            password='password123',
            role=User.Role.STUDENT
        )
        self.other_student = User.objects.create_user(
            username='gary_oak_proc',
            email='gary_proc@example.com',
            password='password123',
            role=User.Role.STUDENT
        )

        self.now = timezone.now()
        self.exam = Exam.objects.create(
            title='Proctored Security Test Exam',
            creator=self.faculty,
            duration_minutes=30,
            total_marks=50.0,
            pass_marks=20.0,
            start_window=self.now - timedelta(hours=1),
            end_window=self.now + timedelta(hours=5),
            is_published=True,
            enable_proctoring=True
        )

        self.attempt = ExamAttempt.objects.create(
            student=self.student,
            exam=self.exam,
            attempt_number=1,
            status=ExamAttempt.AttemptStatus.IN_PROGRESS,
            expires_at=self.now + timedelta(minutes=30)
        )

    def test_log_camera_disconnected_event(self):
        """Test student logging camera disconnected event with timestamp and details."""
        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        payload = {
            'attempt_id': self.attempt.id,
            'event_type': 'CAMERA_DISCONNECTED',
            'details': {
                'reason': 'Webcam unplugged or permission revoked',
                'timestamp': timezone.now().isoformat()
            }
        }

        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['event_type'], 'CAMERA_DISCONNECTED')

        # Check in database
        event = ProctoringEvent.objects.filter(
            attempt=self.attempt,
            event_type='CAMERA_DISCONNECTED'
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.details['reason'], 'Webcam unplugged or permission revoked')

    def test_log_camera_reconnected_event(self):
        """Test student logging camera reconnected event when feed is restored."""
        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        payload = {
            'attempt_id': self.attempt.id,
            'event_type': 'CAMERA_RECONNECTED',
            'details': {
                'message': 'Webcam feed established.',
                'timestamp': timezone.now().isoformat()
            }
        }

        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['event_type'], 'CAMERA_RECONNECTED')

    def test_proctoring_event_rejected_on_completed_attempt(self):
        """Events cannot be recorded once the attempt is submitted or expired."""
        self.attempt.is_completed = True
        self.attempt.status = ExamAttempt.AttemptStatus.SUBMITTED
        self.attempt.save()

        self.client.force_authenticate(user=self.student)
        url = '/api/v1/proctoring/student/events/'

        payload = {
            'attempt_id': self.attempt.id,
            'event_type': 'CAMERA_DISCONNECTED',
            'details': {'reason': 'Late event'}
        }

        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Attempt is not currently in progress', res.data['error'])

    def test_unauthorized_student_cannot_log_events_for_another_attempt(self):
        """A student cannot log events on another student's exam attempt."""
        self.client.force_authenticate(user=self.other_student)
        url = '/api/v1/proctoring/student/events/'

        payload = {
            'attempt_id': self.attempt.id,
            'event_type': 'CAMERA_DISCONNECTED',
            'details': {'reason': 'Unauthorized'}
        }

        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_faculty_can_view_proctoring_events(self):
        """Faculty can inspect all logged camera and integrity events for student review."""
        ProctoringEvent.objects.create(
            attempt=self.attempt,
            event_type='CAMERA_DISCONNECTED',
            details={'reason': 'Covered camera'}
        )
        ProctoringEvent.objects.create(
            attempt=self.attempt,
            event_type='CAMERA_RECONNECTED',
            details={'message': 'Restored'}
        )

        self.client.force_authenticate(user=self.faculty)
        url = f'/api/v1/proctoring/faculty/attempts/{self.attempt.id}/events/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)
