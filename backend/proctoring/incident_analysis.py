from datetime import timedelta
from django.utils import timezone


def analyze_attempt_events(events, attempt):
    """
    Groups raw proctoring events into high-level incidents and computes
    a transparent, explainable risk score and audit summary for faculty.
    """
    incidents = []
    current_incident = None

    sorted_events = sorted(events, key=lambda e: e.timestamp)

    for ev in sorted_events:
        # Determine logical incident grouping category
        cat = 'OTHER'
        if ev.event_type in ['TAB_BLUR', 'TAB_FOCUS']:
            cat = 'FOCUS_LOSS'
        elif ev.event_type == 'NO_FACE_DETECTED':
            cat = 'NO_FACE'
        elif ev.event_type == 'MULTIPLE_FACES_DETECTED':
            cat = 'MULTIPLE_FACES'
        elif ev.event_type in ['FULLSCREEN_EXIT', 'FULLSCREEN_ENTER']:
            cat = 'FULLSCREEN_INTERRUPTION'
        elif ev.event_type in ['CAMERA_DISCONNECTED', 'CAMERA_RECONNECTED']:
            cat = 'CAMERA_STATUS'

        # Check if can merge into current_incident (within 30 seconds of last event in incident)
        can_merge = False
        if current_incident and current_incident['category'] == cat:
            time_diff = (ev.timestamp - current_incident['last_timestamp']).total_seconds()
            if time_diff <= 35:
                can_merge = True

        if can_merge:
            current_incident['events'].append(ev)
            current_incident['last_timestamp'] = ev.timestamp
            current_incident['event_ids'].append(ev.id)
            if ev.review_status == 'FOLLOW_UP':
                current_incident['review_status'] = 'FOLLOW_UP'
            elif ev.review_status == 'DISMISSED' and current_incident['review_status'] == 'PENDING':
                current_incident['review_status'] = 'DISMISSED'
            elif ev.review_status == 'REVIEWED' and current_incident['review_status'] == 'PENDING':
                current_incident['review_status'] = 'REVIEWED'
        else:
            if current_incident:
                incidents.append(current_incident)
            current_incident = {
                'id': len(incidents) + 1,
                'category': cat,
                'events': [ev],
                'event_ids': [ev.id],
                'first_timestamp': ev.timestamp,
                'last_timestamp': ev.timestamp,
                'review_status': ev.review_status,
                'reviewer_notes': ev.reviewer_notes or '',
            }

    if current_incident:
        incidents.append(current_incident)

    # Process and format finalized incidents
    formatted_incidents = []
    risk_score = 0
    factors = []

    category_titles = {
        'FOCUS_LOSS': 'Tab Switch / Window Focus Lost',
        'NO_FACE': 'No Face Detected in Webcam Frame',
        'MULTIPLE_FACES': 'Multiple Persons Visible in Frame',
        'FULLSCREEN_INTERRUPTION': 'Fullscreen Mode Interruption',
        'CAMERA_STATUS': 'Webcam Stream Interruption',
        'OTHER': 'Client Proctoring Event',
    }

    for inc in incidents:
        first_ts = inc['first_timestamp']
        last_ts = inc['last_timestamp']
        duration_sec = max(1, int((last_ts - first_ts).total_seconds()))

        # If details contains duration from client, use it
        for ev in inc['events']:
            if isinstance(ev.details, dict) and 'duration_seconds' in ev.details:
                try:
                    duration_sec = max(duration_sec, int(ev.details['duration_seconds']))
                except (ValueError, TypeError):
                    pass

        cat = inc['category']
        title = category_titles.get(cat, 'Proctoring Incident')

        # Scoring & severity rules
        severity = 'LOW'
        incident_score = 0
        explanation = ''

        if cat == 'MULTIPLE_FACES':
            severity = 'HIGH'
            incident_score = 25
            explanation = f"Multiple faces were detected simultaneously across {len(inc['events'])} signal(s)."
            factors.append(f"Multiple faces visible in camera ({len(inc['events'])} checks)")
        elif cat == 'NO_FACE':
            if duration_sec >= 15 or len(inc['events']) >= 3:
                severity = 'MEDIUM'
                incident_score = 15
                explanation = f"Face was not visible in webcam for ~{duration_sec}s ({len(inc['events'])} checks)."
                factors.append(f"Student absent from camera frame for ~{duration_sec}s")
            else:
                severity = 'LOW'
                incident_score = 5
                explanation = f"Brief absence from camera frame (~{duration_sec}s)."
        elif cat == 'FOCUS_LOSS':
            if duration_sec >= 10 or len(inc['events']) >= 2:
                severity = 'MEDIUM'
                incident_score = 12
                explanation = f"Exam tab lost focus or browser switched away for ~{duration_sec}s."
                factors.append(f"Browser tab focus lost for ~{duration_sec}s")
            else:
                severity = 'LOW'
                incident_score = 6
                explanation = f"Brief window blur or tab switch (~{duration_sec}s)."
        elif cat == 'FULLSCREEN_INTERRUPTION':
            severity = 'MEDIUM'
            incident_score = 10
            explanation = f"Student exited required fullscreen mode ({len(inc['events'])} event(s))."
            factors.append("Fullscreen mode exited")
        elif cat == 'CAMERA_STATUS':
            severity = 'LOW'
            incident_score = 5
            explanation = f"Webcam feed was disconnected or reconnected."

        risk_score += incident_score

        formatted_incidents.append({
            'incident_id': inc['id'],
            'category': cat,
            'title': title,
            'severity': severity,
            'event_count': len(inc['events']),
            'event_ids': inc['event_ids'],
            'start_time': first_ts.isoformat(),
            'end_time': last_ts.isoformat(),
            'duration_seconds': duration_sec,
            'explanation': explanation,
            'review_status': inc['review_status'],
            'reviewer_notes': inc['reviewer_notes'],
        })

    # Bound risk score between 0 and 100
    risk_score = min(100, risk_score)

    # Determine risk level
    if risk_score >= 50:
        risk_level = 'HIGH'
        recommendation = 'Human instructor review recommended. Notable integrity signals were logged.'
    elif risk_score >= 20:
        risk_level = 'MEDIUM'
        recommendation = 'Moderate integrity events logged. Spot-check flagged incidents.'
    else:
        risk_level = 'LOW'
        recommendation = 'Minimal or minor signals observed. Standard verification advised.'

    # Deduplicate factors
    factors = list(dict.fromkeys(factors))
    if not factors:
        factors = ['No significant proctoring anomalies recorded during this attempt.']

    return {
        'attempt_id': attempt.id,
        'student_id': attempt.student_id,
        'student_name': attempt.student.get_full_name() or attempt.student.username,
        'exam_title': attempt.exam.title,
        'attempt_status': attempt.status,
        'total_events_count': len(events),
        'total_incidents_count': len(formatted_incidents),
        'risk_score': risk_score,
        'risk_level': risk_level,
        'factors': factors,
        'recommendation': recommendation,
        'disclaimer': 'Rule-based integrity indicators are provided strictly as an audit aid. Browser and camera signals are imperfect; human faculty review is required before taking any academic action.',
        'incidents': formatted_incidents,
    }
