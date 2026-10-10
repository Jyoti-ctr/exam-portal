from django.test import TestCase
from django.contrib.auth import get_user_model
from .models import StudentProfile, FacultyProfile

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_student_user(self):
        user = User.objects.create_user(
            username='student1',
            email='student1@example.com',
            password='testpassword123',
            role=User.Role.STUDENT
        )
        profile = StudentProfile.objects.create(
            user=user,
            roll_number='STU-2026-001',
            department='Computer Science'
        )
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertTrue(user.is_student)
        self.assertFalse(user.is_faculty)
        self.assertEqual(user.student_profile.roll_number, 'STU-2026-001')

    def test_create_faculty_user(self):
        user = User.objects.create_user(
            username='prof_smith',
            email='prof@example.com',
            password='testpassword123',
            role=User.Role.FACULTY
        )
        profile = FacultyProfile.objects.create(
            user=user,
            employee_id='FAC-101',
            department='Computer Science',
            designation='Assistant Professor'
        )
        self.assertEqual(user.role, User.Role.FACULTY)
        self.assertTrue(user.is_faculty)
        self.assertFalse(user.is_student)
        self.assertEqual(user.faculty_profile.employee_id, 'FAC-101')
