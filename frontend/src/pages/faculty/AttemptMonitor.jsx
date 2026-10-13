import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';

export const AttemptMonitor = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Proctoring Analysis & Events Modal
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [rawEvents, setRawEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('incidents'); // 'incidents' | 'raw'
  const [loadingReview, setLoadingReview] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [incidentNotes, setIncidentNotes] = useState({});

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const [examRes, attemptsRes] = await Promise.all([
        facultyAPI.getExam(examId),
        facultyAPI.getAttempts(examId),
      ]);
      setExam(examRes.data);
      setAttempts(attemptsRes.data);
    } catch {
      alert('Failed to load student attempts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [examId]);

  const handleOpenReview = async (attemptId) => {
    setSelectedAttemptId(attemptId);
    setLoadingReview(true);
    try {
      const [analysisRes, eventsRes] = await Promise.all([
        facultyAPI.getAttemptAnalysis(attemptId),
        facultyAPI.getProctoringEvents(attemptId),
      ]);
      setAnalysis(analysisRes.data);
      setRawEvents(eventsRes.data);
    } catch {
      alert('Failed to load integrity analysis for this attempt.');
    } finally {
      setLoadingReview(false);
    }
  };

  const handleIncidentReview = async (incident, newStatus) => {
    if (actionInProgress) return;
    setActionInProgress(true);
    const note = incidentNotes[incident.incident_id] || '';

    try {
      await facultyAPI.bulkReviewIncident(selectedAttemptId, {
        event_ids: incident.event_ids,
        review_status: newStatus,
        reviewer_notes: note,
      });

      // Refresh analysis and raw events
      const [analysisRes, eventsRes] = await Promise.all([
        facultyAPI.getAttemptAnalysis(selectedAttemptId),
        facultyAPI.getProctoringEvents(selectedAttemptId),
      ]);
      setAnalysis(analysisRes.data);
      setRawEvents(eventsRes.data);
    } catch {
      alert('Failed to update review status.');
    } finally {
      setActionInProgress(false);
    }
  };

  const getSeverityBadge = (severity) => {
    if (severity === 'HIGH') {
      return <span className="badge badge-danger">High Severity</span>;
    }
    if (severity === 'MEDIUM') {
      return <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>Medium Severity</span>;
    }
    return <span className="badge badge-neutral">Low Severity</span>;
  };

  const getRiskBadge = (level, score) => {
    if (level === 'HIGH') {
      return (
        <div style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px' }}>HIGH RISK ASSESSMENT ({score} / 100)</div>
            <div style={{ fontSize: '12px' }}>Multiple or prolonged integrity anomalies were recorded. Instructor review recommended.</div>
          </div>
        </div>
      );
    }
    if (level === 'MEDIUM') {
      return (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚡</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px' }}>MODERATE RISK ASSESSMENT ({score} / 100)</div>
            <div style={{ fontSize: '12px' }}>Moderate focus loss or vision anomalies logged. Spot-checking flagged items advised.</div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>✓</span>
        <div>
          <div style={{ fontWeight: '800', fontSize: '15px' }}>LOW RISK ASSESSMENT ({score} / 100)</div>
          <div style={{ fontSize: '12px' }}>Nominal integrity telemetry. No significant interruptions logged.</div>
        </div>
      </div>
    );
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
            Live attempt monitoring, server timer enforcement, and rule-based proctoring audit
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Link to={`/faculty/exams/${examId}/results`} className="btn btn-primary btn-sm">
            Marking & Reviews 📝
          </Link>
          <button onClick={loadData} className="btn btn-secondary btn-sm">
            Refresh Live Status
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--gray-500)' }}>Loading student attempts...</div>
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
                  <th>Student & Attempt</th>
                  <th>Session Status</th>
                  <th>Navigation</th>
                  <th>Warnings</th>
                  <th>Submission Type</th>
                  <th>Answers Saved</th>
                  <th>AI Proctoring Review</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((att) => (
                  <tr key={att.id}>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--gray-900)' }}>
                        Attempt #{att.attempt_number || 1} (ID: {att.id})
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        Student #{att.student || att.student_username || 'Student'}
                      </div>
                    </td>
                    <td>
                      {att.status === 'SUBMITTED' ? (
                        <span className="badge badge-success">Submitted</span>
                      ) : att.status === 'AUTO_SUBMITTED' ? (
                        <span className="badge badge-danger">
                          Auto-Submitted
                        </span>
                      ) : att.status === 'IN_PROGRESS' ? (
                        <span className="badge badge-warning">In Progress ({Math.floor((att.remaining_seconds || 0) / 60)}m left)</span>
                      ) : (
                        <span className="badge badge-neutral">{att.status}</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                        {att.navigation_mode === 'FORWARD_ONLY' ? 'Forward Only' : 'Forward & Backward'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          (att.warning_count || 0) >= 8
                            ? 'badge-danger'
                            : (att.warning_count || 0) > 0
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                        style={{ fontWeight: '700' }}
                      >
                        ⚠️ {att.warning_count || 0} / {att.max_warnings || att.warning_threshold || 8}
                      </span>
                    </td>
                    <td>
                      {att.submission_reason === 'warning_threshold_exceeded' ? (
                        <span className="badge badge-danger" title="Automatically submitted after exceeding 8 warnings">
                          Auto (8+ Warnings)
                        </span>
                      ) : att.submission_reason === 'time_expired' ? (
                        <span className="badge badge-warning" title="Automatically submitted when timer expired">
                          Auto (Timeout)
                        </span>
                      ) : att.submission_reason === 'manual' ? (
                        <span className="badge badge-success">
                          Manual
                        </span>
                      ) : att.is_completed ? (
                        <span className="badge badge-neutral">Submitted</span>
                      ) : (
                        <span style={{ color: 'var(--gray-400)', fontSize: '12px' }}>In progress</span>
                      )}
                    </td>
                    <td>
                      <strong>{(att.saved_answers || []).length}</strong> responses saved
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenReview(att.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <span>Review Signals</span>
                          <span style={{ fontSize: '11px', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: '10px' }}>
                            AI Audit 📋
                          </span>
                        </button>
                        <Link
                          to={`/faculty/exams/${examId}/results`}
                          className="btn btn-primary btn-sm"
                        >
                          Grade ✍️
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI-Assisted Proctoring Review Modal */}
      {selectedAttemptId && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '820px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>
                  AI-Assisted Proctoring Review
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span>Attempt #{selectedAttemptId} • Student: {analysis?.student_name || 'Examinee'}</span>
                  {attempts.find(a => a.id === selectedAttemptId) && (
                    <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                      Warnings: {attempts.find(a => a.id === selectedAttemptId).warning_count || 0} / {attempts.find(a => a.id === selectedAttemptId).max_warnings || 8}
                      {attempts.find(a => a.id === selectedAttemptId).submission_reason && ` • Submission: ${attempts.find(a => a.id === selectedAttemptId).submission_reason}`}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedAttemptId(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>

            {/* Modal Content Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {loadingReview ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-500)' }}>
                  Analyzing recorded events and generating explainable risk indicators...
                </div>
              ) : !analysis ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>No audit telemetry available.</div>
              ) : (
                <>
                  {/* Risk Assessment Indicator */}
                  {getRiskBadge(analysis.risk_level, analysis.risk_score)}

                  {/* Explainable Rationale Box */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', fontSize: '13px' }}>
                    <div style={{ fontWeight: '700', color: 'var(--gray-900)', marginBottom: '8px' }}>
                      Documented Rule-Based Rationale:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--gray-700)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {analysis.factors.map((factor, idx) => (
                        <li key={idx}>{factor}</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--gray-500)', fontStyle: 'italic', borderTop: '1px solid var(--gray-200)', paddingTop: '8px' }}>
                      <strong>Human Reviewer Advisory:</strong> {analysis.recommendation}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--gray-400)' }}>
                      {analysis.disclaimer}
                    </div>
                  </div>

                  {/* Tabs: Grouped Incidents vs Raw Events */}
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--gray-200)', paddingBottom: '8px' }}>
                    <button
                      onClick={() => setActiveTab('incidents')}
                      className={`btn btn-sm ${activeTab === 'incidents' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      Grouped Incidents ({analysis.incidents.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('raw')}
                      className={`btn btn-sm ${activeTab === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      Raw Telemetry Logs ({rawEvents.length})
                    </button>
                  </div>

                  {/* Tab 1: Grouped Incidents */}
                  {activeTab === 'incidents' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {analysis.incidents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-500)' }}>
                          ✓ No integrity incidents flagged during this examination session.
                        </div>
                      ) : (
                        analysis.incidents.map((inc) => (
                          <div
                            key={inc.incident_id}
                            style={{
                              padding: '16px',
                              borderRadius: '8px',
                              border: '1px solid var(--gray-200)',
                              background: inc.severity === 'HIGH' ? '#fff1f2' : inc.severity === 'MEDIUM' ? '#fffbeb' : '#fff',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                              <div>
                                <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--gray-900)' }}>
                                  Incident #{inc.incident_id}: {inc.title}
                                </span>
                                <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                                  Time: {new Date(inc.start_time).toLocaleTimeString()} ({inc.duration_seconds}s duration • {inc.event_count} events)
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {getSeverityBadge(inc.severity)}
                                <span
                                  className={`badge ${
                                    inc.review_status === 'REVIEWED'
                                      ? 'badge-success'
                                      : inc.review_status === 'DISMISSED'
                                      ? 'badge-neutral'
                                      : inc.review_status === 'FOLLOW_UP'
                                      ? 'badge-danger'
                                      : 'badge-warning'
                                  }`}
                                >
                                  {inc.review_status}
                                </span>
                              </div>
                            </div>

                            <p style={{ fontSize: '13px', color: 'var(--gray-700)', margin: '10px 0 12px 0', lineHeight: '1.4' }}>
                              {inc.explanation}
                            </p>

                            {/* Human Review Decision Actions */}
                            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '10px' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="Add faculty note for this incident..."
                                  style={{ flex: 1, minWidth: '220px', fontSize: '12px', padding: '6px 10px' }}
                                  value={incidentNotes[inc.incident_id] !== undefined ? incidentNotes[inc.incident_id] : inc.reviewer_notes}
                                  onChange={(e) =>
                                    setIncidentNotes({ ...incidentNotes, [inc.incident_id]: e.target.value })
                                  }
                                />
                                <button
                                  onClick={() => handleIncidentReview(inc, 'REVIEWED')}
                                  disabled={actionInProgress}
                                  className="btn btn-secondary btn-sm"
                                  style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                                >
                                  ✓ Mark Reviewed
                                </button>
                                <button
                                  onClick={() => handleIncidentReview(inc, 'DISMISSED')}
                                  disabled={actionInProgress}
                                  className="btn btn-secondary btn-sm"
                                  style={{ background: '#f1f5f9', color: '#475569' }}
                                >
                                  Dismiss False Positive
                                </button>
                                <button
                                  onClick={() => handleIncidentReview(inc, 'FOLLOW_UP')}
                                  disabled={actionInProgress}
                                  className="btn btn-secondary btn-sm"
                                  style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
                                >
                                  🚩 Require Follow-up
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Tab 2: Raw Telemetry Stream */}
                  {activeTab === 'raw' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {rawEvents.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--gray-200)',
                            background: '#f8fafc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: '700', color: 'var(--gray-900)' }}>
                              {ev.event_type_display || ev.event_type}
                            </span>
                            <span style={{ color: 'var(--gray-500)', marginLeft: '10px' }}>
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                            {ev.details && Object.keys(ev.details).length > 0 && (
                              <div style={{ color: 'var(--gray-600)', marginTop: '2px', fontStyle: 'italic' }}>
                                Metadata: {JSON.stringify(ev.details)}
                              </div>
                            )}
                          </div>
                          <span className="badge badge-neutral">{ev.review_status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
