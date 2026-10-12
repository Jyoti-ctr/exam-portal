from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom User model with server-enforced role-based access.
    """
    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        FACULTY = 'FACULTY', 'Faculty/Admin'

    email = models.EmailField(
        unique=True,
        help_text="Required unique email address for all student and faculty accounts"
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STUDENT,
        help_text="Determines user permissions and portal interface"
    )

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_faculty(self):
        return self.role == self.Role.FACULTY or self.is_staff or self.is_superuser

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class StudentProfile(models.Model):
    """
    Additional metadata specific to student accounts.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='student_profile'
    )
    roll_number = models.CharField(max_length=50, unique=True)
    department = models.CharField(max_length=100)
    batch = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.roll_number} - {self.user.get_full_name() or self.user.username}"


class FacultyProfile(models.Model):
    """
    Additional metadata specific to faculty / exam administrator accounts.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='faculty_profile'
    )
    employee_id = models.CharField(max_length=50, unique=True)
    department = models.CharField(max_length=100)
    designation = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee_id} - {self.user.get_full_name() or self.user.username}"
