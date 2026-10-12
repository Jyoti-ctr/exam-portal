from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, StudentProfile, FacultyProfile


class StudentProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProfile
        fields = ['roll_number', 'department', 'batch']


class FacultyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FacultyProfile
        fields = ['employee_id', 'department', 'designation']


class UserSerializer(serializers.ModelSerializer):
    student_profile = StudentProfileSerializer(read_only=True)
    faculty_profile = FacultyProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'student_profile',
            'faculty_profile',
        ]
        read_only_fields = ['id', 'role']


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if not username or not password:
            raise serializers.ValidationError("Both username and password are required.")

        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError("Invalid credentials. Please verify your username and password.")

        if not user.is_active:
            raise serializers.ValidationError("This user account is inactive.")

        attrs['user'] = user
        return attrs


class StudentRegisterSerializer(serializers.Serializer):
    """
    Public student registration serializer.
    Guarantees:
    - Strictly registers as Role.STUDENT (prevents faculty/admin privilege escalation).
    - Validates required fields, uniqueness of username, email, and roll number.
    - Uses Django's secure password validators and password hashing.
    """
    username = serializers.CharField(max_length=150, required=True)
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    roll_number = serializers.CharField(max_length=50, required=True)
    department = serializers.CharField(max_length=100, required=True)
    batch = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate_username(self, value):
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Username cannot be empty.")
        if User.objects.filter(username__iexact=val).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return val

    def validate_email(self, value):
        val = value.strip().lower()
        if not val:
            raise serializers.ValidationError("Email address is required.")
        if User.objects.filter(email__iexact=val).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return val

    def validate_roll_number(self, value):
        val = value.strip().upper()
        if not val:
            raise serializers.ValidationError("Roll number cannot be empty.")
        if StudentProfile.objects.filter(roll_number__iexact=val).exists():
            raise serializers.ValidationError("A student with this Roll Number is already registered.")
        return val

    def validate(self, attrs):
        pwd = attrs.get('password')
        confirm_pwd = attrs.get('confirm_password')

        if pwd != confirm_pwd:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})

        # Run Django configured password validators
        from django.contrib.auth.password_validation import validate_password
        try:
            # Create a mock user instance for attribute similarity checks
            mock_user = User(
                username=attrs.get('username'),
                email=attrs.get('email'),
                first_name=attrs.get('first_name'),
                last_name=attrs.get('last_name'),
            )
            validate_password(pwd, user=mock_user)
        except Exception as exc:
            msg = list(exc.messages) if hasattr(exc, 'messages') else [str(exc)]
            raise serializers.ValidationError({'password': msg})

        return attrs

    def create(self, validated_data):
        from django.db import transaction

        validated_data.pop('confirm_password', None)
        roll_no = validated_data.pop('roll_number').strip().upper()
        dept = validated_data.pop('department').strip()
        batch_val = validated_data.pop('batch', '').strip()
        pwd = validated_data.pop('password')

        with transaction.atomic():
            # Strictly create with STUDENT role. No public caller can choose role.
            user = User.objects.create_user(
                username=validated_data['username'].strip(),
                email=validated_data['email'].strip().lower(),
                password=pwd,
                first_name=validated_data['first_name'].strip(),
                last_name=validated_data['last_name'].strip(),
                role=User.Role.STUDENT,
            )

            StudentProfile.objects.create(
                user=user,
                roll_number=roll_no,
                department=dept,
                batch=batch_val,
            )

        return user

