from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.authtoken.models import Token
from django.contrib.auth import login, logout
from .serializers import LoginSerializer, UserSerializer, StudentRegisterSerializer


class RegisterView(APIView):
    """
    POST: Public registration for students.
    Validates account uniqueness and creates Student user + profile.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = StudentRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        token, _ = Token.objects.get_or_create(user=user)
        login(request, user)  # Synchronize session for hybrid use

        return Response({
            'token': token.key,
            'user': UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """
    POST: Authenticates credentials and returns auth token + role info.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        token, _ = Token.objects.get_or_create(user=user)
        login(request, user)  # Synchronize session for hybrid use

        return Response({
            'token': token.key,
            'user': UserSerializer(user).data
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST: Invalidate auth token and end session.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            request.user.auth_token.delete()
        except Exception:
            pass
        logout(request)
        return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


class MeView(APIView):
    """
    GET: Retrieve details of currently authenticated user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
