from rest_framework.permissions import BasePermission
from .models import User


class IsFacultyUser(BasePermission):
    """
    Allows access only to authenticated faculty or admin users.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_faculty
        )


class IsStudentUser(BasePermission):
    """
    Allows access only to authenticated students.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_student
        )
