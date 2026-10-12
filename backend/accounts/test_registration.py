from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import StudentProfile

User = get_user_model()


class StudentRegistrationAndAuthTests(APITestCase):
    def test_01_two_students_register_and_login_independently(self):
        # Register Student 1
        reg_payload_1 = {
            'username': 'student_one',
            'email': 'student_one@college.edu',
            'password': 'SecurePassword@123',
            'confirm_password': 'SecurePassword@123',
            'roll_number': 'CS-2026-001',
            'department': 'Computer Science',
            'first_name': 'Alice',
            'last_name': 'Smith'
        }
        res1 = self.client.post('/api/v1/auth/register/', reg_payload_1)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', res1.data)
        self.assertEqual(res1.data['user']['role'], 'STUDENT')
        self.assertEqual(res1.data['user']['username'], 'student_one')

        # Verify password is secure hash, not plain text
        user1 = User.objects.get(username='student_one')
        self.assertNotEqual(user1.password, 'SecurePassword@123')
        self.assertTrue(user1.check_password('SecurePassword@123'))
        self.assertEqual(user1.role, User.Role.STUDENT)
        self.assertEqual(user1.student_profile.roll_number, 'CS-2026-001')

        # Register Student 2
        reg_payload_2 = {
            'username': 'student_two',
            'email': 'student_two@college.edu',
            'password': 'SecurePassword@456',
            'confirm_password': 'SecurePassword@456',
            'roll_number': 'CS-2026-002',
            'department': 'Computer Science',
            'first_name': 'Bob',
            'last_name': 'Jones'
        }
        res2 = self.client.post('/api/v1/auth/register/', reg_payload_2)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', res2.data)
        self.assertNotEqual(res1.data['token'], res2.data['token'])

        # Both can log in independently
        login_res1 = self.client.post('/api/v1/auth/login/', {
            'username': 'student_one',
            'password': 'SecurePassword@123'
        })
        self.assertEqual(login_res1.status_code, status.HTTP_200_OK)

        login_res2 = self.client.post('/api/v1/auth/login/', {
            'username': 'student_two',
            'password': 'SecurePassword@456'
        })
        self.assertEqual(login_res2.status_code, status.HTTP_200_OK)

    def test_02_duplicate_registration_rejected(self):
        # Initial valid user
        initial_payload = {
            'username': 'student_alpha',
            'email': 'alpha@college.edu',
            'first_name': 'Alpha',
            'last_name': 'Tester',
            'password': 'StrongPassword!99',
            'confirm_password': 'StrongPassword!99',
            'roll_number': 'ROLL-101',
            'department': 'Mechanical',
        }
        res_init = self.client.post('/api/v1/auth/register/', initial_payload)
        self.assertEqual(res_init.status_code, status.HTTP_201_CREATED)

        # Duplicate username
        dup_user = initial_payload.copy()
        dup_user['email'] = 'other_email@college.edu'
        dup_user['roll_number'] = 'ROLL-102'
        res_dup_u = self.client.post('/api/v1/auth/register/', dup_user)
        self.assertEqual(res_dup_u.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', res_dup_u.data)

        # Duplicate email
        dup_email = initial_payload.copy()
        dup_email['username'] = 'different_user'
        dup_email['roll_number'] = 'ROLL-103'
        res_dup_e = self.client.post('/api/v1/auth/register/', dup_email)
        self.assertEqual(res_dup_e.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', res_dup_e.data)

        # Duplicate roll number
        dup_roll = initial_payload.copy()
        dup_roll['username'] = 'user_roll_dup'
        dup_roll['email'] = 'user_roll_dup@college.edu'
        res_dup_r = self.client.post('/api/v1/auth/register/', dup_roll)
        self.assertEqual(res_dup_r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('roll_number', res_dup_r.data)

    def test_03_role_tampering_is_blocked(self):
        # Attempt to escalate privileges to FACULTY or ADMIN in payload
        tampered_payload = {
            'username': 'sneaky_user',
            'email': 'sneaky@college.edu',
            'first_name': 'Sneaky',
            'last_name': 'Hacker',
            'password': 'StrongPassword!99',
            'confirm_password': 'StrongPassword!99',
            'roll_number': 'ROLL-999',
            'department': 'IT',
            'role': 'FACULTY',
            'is_staff': True,
            'is_superuser': True
        }
        res = self.client.post('/api/v1/auth/register/', tampered_payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username='sneaky_user')
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_04_unauthenticated_requests_blocked(self):
        # Unauthenticated request to protected endpoints returns 401
        res1 = self.client.get('/api/v1/student/exams/')
        self.assertEqual(res1.status_code, status.HTTP_401_UNAUTHORIZED)

        res2 = self.client.get('/api/v1/faculty/exams/')
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)
