from django.contrib import admin
from .models import ProctoringEvent


@admin.register(ProctoringEvent)
class ProctoringEventAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'attempt',
        'event_type',
        'timestamp',
        'is_reviewed'
    )
    list_filter = ('event_type', 'is_reviewed')
    search_fields = ('attempt__student__username', 'attempt__exam__title')
    readonly_fields = ('attempt', 'event_type', 'timestamp', 'details')
