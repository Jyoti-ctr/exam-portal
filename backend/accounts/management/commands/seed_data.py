from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from accounts.models import User, StudentProfile, FacultyProfile
from exams.models import Exam, Question, Option


class Command(BaseCommand):
    help = 'Seeds initial faculty, students, and a demo published exam for local testing.'

    def handle(self, *args, **options):
        self.stdout.write('Seeding initial exam portal data...')

        # 1. Create Faculty
        faculty, created = User.objects.get_or_create(
            username='faculty1',
            defaults={
                'email': 'faculty@college.edu',
                'first_name': 'Dr. Robert',
                'last_name': 'Smith',
                'role': User.Role.FACULTY,
                'is_staff': True,
            }
        )
        if created:
            faculty.set_password('FacultyPass123!')
            faculty.save()
            FacultyProfile.objects.create(
                user=faculty,
                employee_id='FAC-CS-001',
                department='Computer Science & Engineering',
                designation='Associate Professor'
            )
            self.stdout.write(self.style.SUCCESS('Created faculty account: faculty1 / FacultyPass123!'))

        # 2. Create Student 1
        student1, s1_created = User.objects.get_or_create(
            username='student1',
            defaults={
                'email': 'student1@college.edu',
                'first_name': 'Alice',
                'last_name': 'Johnson',
                'role': User.Role.STUDENT,
            }
        )
        if s1_created:
            student1.set_password('StudentPass123!')
            student1.save()
            StudentProfile.objects.create(
                user=student1,
                roll_number='2026-CSE-001',
                department='Computer Science & Engineering',
                batch='2022-2026'
            )
            self.stdout.write(self.style.SUCCESS('Created student account: student1 / StudentPass123!'))

        # 3. Create Student 2
        student2, s2_created = User.objects.get_or_create(
            username='student2',
            defaults={
                'email': 'student2@college.edu',
                'first_name': 'Bob',
                'last_name': 'Williams',
                'role': User.Role.STUDENT,
            }
        )
        if s2_created:
            student2.set_password('StudentPass123!')
            student2.save()
            StudentProfile.objects.create(
                user=student2,
                roll_number='2026-CSE-002',
                department='Computer Science & Engineering',
                batch='2022-2026'
            )
            self.stdout.write(self.style.SUCCESS('Created student account: student2 / StudentPass123!'))

        # 4. Create Demo Published Exam
        now = timezone.now()
        exam, exam_created = Exam.objects.get_or_create(
            title='Web Technologies & REST APIs - Midterm Exam',
            defaults={
                'description': 'Comprehensive exam covering HTTP methods, REST architectural constraints, React state management, and database normalization.',
                'creator': faculty,
                'duration_minutes': 45,
                'total_marks': 25.0,
                'pass_marks': 10.0,
                'start_window': now - timedelta(hours=2),
                'end_window': now + timedelta(days=7),
                'shuffle_questions': True,
                'shuffle_options': True,
                'enable_proctoring': True,
                'is_published': True,
            }
        )

        if exam_created:
            # Q1 - MCQ
            q1 = Question.objects.create(
                exam=exam,
                question_text='Which HTTP status code signifies that a resource was successfully created on the server?',
                question_type=Question.QuestionType.MCQ,
                marks=5.0,
                negative_marks=1.0,
                order=1
            )
            Option.objects.create(question=q1, option_text='200 OK', is_correct=False, order=1)
            Option.objects.create(question=q1, option_text='201 Created', is_correct=True, order=2)
            Option.objects.create(question=q1, option_text='204 No Content', is_correct=False, order=3)
            Option.objects.create(question=q1, option_text='202 Accepted', is_correct=False, order=4)

            # Q2 - MCQ
            q2 = Question.objects.create(
                exam=exam,
                question_text='What is the primary benefit of making an autosave API endpoint idempotent?',
                question_type=Question.QuestionType.MCQ,
                marks=5.0,
                negative_marks=1.0,
                order=2
            )
            Option.objects.create(question=q2, option_text='It encrypts the payload on transit', is_correct=False, order=1)
            Option.objects.create(question=q2, option_text='Repeating the identical request produces the same server state without duplicates', is_correct=True, order=2)
            Option.objects.create(question=q2, option_text='It bypasses database transactions completely', is_correct=False, order=3)
            Option.objects.create(question=q2, option_text='It runs client-side JavaScript faster', is_correct=False, order=4)

            # Q3 - MCQ
            q3 = Question.objects.create(
                exam=exam,
                question_text='In Django ORM, which method should be used to avoid the N+1 queries problem on ForeignKey relationships?',
                question_type=Question.QuestionType.MCQ,
                marks=5.0,
                negative_marks=1.0,
                order=3
            )
            Option.objects.create(question=q3, option_text='select_related()', is_correct=True, order=1)
            Option.objects.create(question=q3, option_text='defer()', is_correct=False, order=2)
            Option.objects.create(question=q3, option_text='only()', is_correct=False, order=3)
            Option.objects.create(question=q3, option_text='raw()', is_correct=False, order=4)

            # Q4 - Descriptive
            q4 = Question.objects.create(
                exam=exam,
                question_text='Explain how transparent browser proctoring operates using the HTML5 Page Visibility API and Fullscreen API. How does the server validate these events without violating student privacy?',
                question_type=Question.QuestionType.DESCRIPTIVE,
                marks=10.0,
                order=4
            )

            self.stdout.write(self.style.SUCCESS(f'Created sample exam with 4 questions: {exam.title}'))

        self.stdout.write(self.style.SUCCESS('Data seeding complete! Ready for local development and testing.'))
