from django.contrib import admin
from .models import ExamAttempt, StudentAnswer


class StudentAnswerInline(admin.TabularInline):
    model = StudentAnswer
    extra = 0
    readonly_fields = ('question', 'selected_option', 'text_response', 'updated_at')


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'student',
        'exam',
        'status',
        'started_at',
        'expires_at',
        'submitted_at',
        'is_completed'
    )
    list_filter = ('status', 'is_completed', 'exam')
    search_fields = ('student__username', 'exam__title')
    inlines = [StudentAnswerInline]


@admin.register(StudentAnswer)
class StudentAnswerAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'attempt',
        'question',
        'selected_option',
        'is_marked_for_review',
        'awarded_marks',
        'updated_at'
    )
    list_filter = ('is_marked_for_review',)
    search_fields = ('attempt__student__username',)
