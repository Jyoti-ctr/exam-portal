from django.contrib import admin
from .models import ExamResult


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'student',
        'exam',
        'total_score',
        'percentage',
        'passed',
        'is_published',
        'evaluated_by',
        'created_at'
    )
    list_filter = ('passed', 'is_published', 'exam')
    search_fields = ('student__username', 'exam__title')
    readonly_fields = ('created_at', 'updated_at')
