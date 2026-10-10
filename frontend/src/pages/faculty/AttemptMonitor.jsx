import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';

export const AttemptMonitor = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Proctoring Events Modal
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewingEventId, setReviewingEventId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [examRes, attemptsRes] = await Promise.all([
        facultyAPI.getExam(examId),
        facultyAPI.getAttempts(examId),
      ]);
      setExam(examRes.data);
      setAttempts(attemptsRes.data);
    } catch {
      alert('Failed to load attempts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [examId]);

  const handleOpenEvents = async (attemptId) => {
    setSelectedAttemptId(attemptId);
    setLoadingEvents(true);
    try {
      const res = await facultyAPI.getProctoringEvents(attemptId);
      setEvents(res.data);
    } catch {
      alert('Failed to load proctoring audit events.');
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSaveReview = async (eventId) => {
    try {
      await facultyAPI.reviewProctoringEvent(eventId, reviewNote);
      setReviewingEventId(null);
      setReviewNote('');
      // Refresh events
      const res = await facultyAPI.getProctoringEvents(selectedAttemptId);
      setEvents(res.data);
    } catch {
      alert('Failed to save review note.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link to="/faculty" style={{ fontSize: '13px', color: 'var(--primary)', textDecoration: 'none' }}>
              ‹ Faculty Dashboard
            </Link>
          </div>
          <h1 className="page-title">
            Student Attempts: {exam?.title || 'Exam'}
          </h1>
          <p className="page-subtitle">
            Live attempt monitoring, remaining times, and integrity audit signals
          </p>
        </div>

        <button onClick={loadData} className="btn btn-secondary btn-sm">
          Refresh Live Status
        </button>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--gray-500)' }}>Loading attempts...</div>
        ) : attempts.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
            <p style={{ fontSize: '16px', fontWeight: '500' }}>No student attempts recorded yet.</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>Student sessions will appear here as soon as they begin the exam.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Session Status</th>
                  <th>Started At</th>
                  <th>Deadline / Submitted</th>
                  <th>Answers Saved</th>
                  <th>Integrity Audit</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att) => (
                  <tr key={att.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--gray-900)' }}>
                        Attempt #{att.id}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        Student ID: {att.student || att.student_username || 'Student'}
                      </div>
                    </td>
                    <td>
                      {att.status === 'SUBMITTED' ? (
                        <span className="badge badge-success">Submitted</span>
                      ) : att.status === 'IN_PROGRESS' ? (
                        <span className="badge badge-warning">In Progress ({Math.floor(att.remaining_seconds / 60)}m left)</span>
                      ) : (
                        <span className="badge badge-danger">Expired / Auto-Submitted</span>
                      )}
                    </td>
                    <td>{new Date(att.started_at).toLocaleTimeString()}</td>
                    <td>
                      {att.is_completed
                        ? `Submitted at ${new Date(att.submitted_at || att.expires_at).toLocaleTimeString()}`
                        : `Hard Deadline: ${new Date(att.expires_at).toLocaleTimeString()}`}
                    </td>
                    <td>
                      <strong>{(att.saved_answers || []).length}</strong> questions answered
                    </td>
                    <td>
                      <button
                        onClick={() => handleOpenEvents(att.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        Audit Signals 📋
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proctoring Signals Review Modal */}
      {selectedAttemptId && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>
                Proctoring Audit Log (Attempt #{selectedAttemptId})
              </h2>
              <button onClick={() => setSelectedAttemptId(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {loadingEvents ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>Loading events...</div>
              ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px', color: 'var(--gray-500)' }}>
                  ✓ Clean Session: No integrity anomalies or blur events recorded for this student attempt.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '6px',
                        border: '1px solid var(--gray-200)',
                        background: ev.event_type.includes('BLUR') || ev.event_type.includes('EXIT') ? '#fff7ed' : '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--gray-900)' }}>
                            {ev.event_type_display || ev.event_type}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--gray-500)', marginLeft: '10px' }}>
                            {new Date(ev.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {ev.is_reviewed ? (
                          <span className="badge badge-success">Reviewed</span>
                        ) : (
                          <span className="badge badge-neutral">Flagged for Review</span>
                        )}
                      </div>

                      {ev.details && Object.keys(ev.details).length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '4px', fontStyle: 'italic' }}>
                          Details: {JSON.stringify(ev.details)}
                        </div>
                      )}

                      {ev.reviewer_notes && (
                        <div style={{ fontSize: '12px', color: 'var(--primary)', marginTop: '6px', fontWeight: '500' }}>
                          Faculty Note: {ev.reviewer_notes}
                        </div>
                      )}

                      {reviewingEventId === ev.id ? (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ fontSize: '12px', padding: '6px 10px' }}
                            placeholder="Add faculty review comment..."
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                          />
                          <button onClick={() => handleSaveReview(ev.id)} className="btn btn-primary btn-sm">
                            Save
                          </button>
                          <button onClick={() => setReviewingEventId(null)} className="btn btn-secondary btn-sm">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: '6px', textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setReviewingEventId(ev.id);
                              setReviewNote(ev.reviewer_notes || '');
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                          >
                            {ev.reviewer_notes ? 'Edit Note' : '+ Add Note'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
