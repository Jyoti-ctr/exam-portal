from django.contrib import admin
from .models import Exam, Question, Option


class OptionInline(admin.TabularInline):
    model = Option
    extra = 4


class QuestionInline(admin.StackedInline):
    model = Question
    extra = 1


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = (
        'title',
        'creator',
        'duration_minutes',
        'total_marks',
        'is_published',
        'start_window',
        'end_window'
    )
    list_filter = ('is_published', 'enable_proctoring')
    search_fields = ('title', 'creator__username')
    filter_horizontal = ('assigned_students',)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'exam', 'question_type', 'marks', 'negative_marks')
    list_filter = ('question_type', 'exam')
    search_fields = ('question_text',)
    inlines = [OptionInline]


@admin.register(Option)
class OptionAdmin(admin.ModelAdmin):
    list_display = ('option_text', 'question', 'is_correct', 'order')
    list_filter = ('is_correct',)
