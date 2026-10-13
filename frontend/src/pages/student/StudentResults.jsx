import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentAPI } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';

export const StudentResults = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Acknowledgment Modal
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState(null);
  const [ackNotes, setAckNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Clarification Request Modal
  const [clarifyModalOpen, setClarifyModalOpen] = useState(false);
  const [clarifyMessage, setClarifyMessage] = useState('');

  const fetchResults = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await studentAPI.getPublishedResults();
      setResults(res.data);
    } catch {
      setError('Failed to load your examination results and feedback.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults(false);
  }, []);

  const handleOpenAcknowledge = (resultId) => {
    setSelectedResultId(resultId);
    setAckNotes('');
    setAckModalOpen(true);
  };

  const handleConfirmAcknowledge = async () => {
    if (!selectedResultId) return;
    setActionLoading(true);
    try {
      await studentAPI.acknowledgeResult(selectedResultId, ackNotes.trim());
      alert('Feedback acknowledged successfully!');
      setAckModalOpen(false);
      fetchResults();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to acknowledge feedback.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenClarification = (resultId) => {
    setSelectedResultId(resultId);
    setClarifyMessage('');
    setClarifyModalOpen(true);
  };

  const handleConfirmClarification = async () => {
    if (!selectedResultId) return;
    if (!clarifyMessage.trim()) {
      alert('Please enter your question or clarification request.');
      return;
    }
    setActionLoading(true);
    try {
      await studentAPI.requestClarification(selectedResultId, clarifyMessage.trim());
      alert('Clarification request submitted to your course instructor.');
      setClarifyModalOpen(false);
      fetchResults();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit clarification request.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Exam Results & Faculty Feedback</h1>
          <p className="page-subtitle">
            View verified examination marks, written instructor feedback, and review statuses
          </p>
        </div>
        <Link to="/student" className="btn btn-secondary">
          ‹ Back to Dashboard
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--gray-500)' }}>
          Loading your exam evaluations...
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--danger)', padding: '24px' }}>
          {error}
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--gray-500)' }}>
          <p style={{ fontSize: '16px', fontWeight: '600' }}>No examination submissions on record yet.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>
            When you complete and submit an examination, your submission records and published evaluations will appear here.
          </p>
          <Link to="/student" className="btn btn-primary" style={{ marginTop: '16px' }}>
            Browse Available Exams
          </Link>
        </div>
      ) : (
        <div className="grid-3" style={{ alignItems: 'stretch' }}>
          {results.map((res) => {
            const isPublished = res.is_published;

            return (
              <div
                key={res.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: isPublished
                    ? res.passed
                      ? '4px solid var(--success)'
                      : '4px solid var(--danger)'
                    : '4px solid var(--primary)',
                }}
              >
                <div>
                  {/* Status Badges */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    {isPublished ? (
                      <span className="badge badge-success">Official Results Released</span>
                    ) : (
                      <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                        {res.review_status_display || 'Awaiting Review'}
                      </span>
                    )}

                    {isPublished && (
                      res.passed ? (
                        <span className="badge badge-success">PASSED</span>
                      ) : (
                        <span className="badge badge-danger">NEEDS IMPROVEMENT</span>
                      )
                    )}
                  </div>

                  <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--gray-900)', marginBottom: '6px' }}>
                    {res.exam_title}
                  </h3>

                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '16px' }}>
                    Submitted: {new Date(res.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>

                  {isPublished ? (
                    <>
                      {/* Published Score Card */}
                      <div
                        style={{
                          background: 'var(--gray-50)',
                          padding: '16px',
                          borderRadius: '8px',
                          border: '1px solid var(--gray-200)',
                          marginBottom: '16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--gray-600)', fontWeight: '600' }}>Final Score:</span>
                          <strong style={{ fontSize: '20px', color: res.passed ? 'var(--success)' : 'var(--danger)' }}>
                            {res.total_score} / {res.exam_total_marks}
                          </strong>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--gray-600)', marginBottom: '10px' }}>
                          <span>Percentage:</span>
                          <strong>{res.percentage}%</strong>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)', paddingTop: '8px', borderTop: '1px solid var(--gray-200)' }}>
                          <span>Objective (MCQ):</span>
                          <span>{res.objective_score} marks</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                          <span>Descriptive (Essay):</span>
                          <span>{res.descriptive_score} marks</span>
                        </div>
                      </div>

                      {/* Instructor Feedback */}
                      {res.feedback ? (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#166534', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Instructor Feedback:
                          </div>
                          <div style={{ fontSize: '13px', color: '#14532d', lineHeight: '1.5', fontStyle: 'italic' }}>
                            "{res.feedback}"
                          </div>
                          {res.published_at && (
                            <div style={{ fontSize: '10px', color: '#15803d', marginTop: '6px', textAlign: 'right' }}>
                              Published: {new Date(res.published_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)', fontStyle: 'italic', marginBottom: '14px' }}>
                          No additional written comments provided by instructor.
                        </div>
                      )}

                      {/* Clarification Request & Response Display */}
                      {res.clarification_requested && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#92400e', marginBottom: '4px' }}>
                            💬 Your Clarification Request:
                          </div>
                          <div style={{ fontSize: '12px', color: '#78350f', fontStyle: 'italic', marginBottom: '8px' }}>
                            "{res.clarification_request_text}"
                          </div>

                          {res.clarification_response_text ? (
                            <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fcd34d' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#047857' }}>
                                ✓ Instructor Response:
                              </div>
                              <div style={{ fontSize: '12px', color: '#065f46', marginTop: '2px' }}>
                                {res.clarification_response_text}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#b45309' }}>
                              ⏳ Pending instructor review
                            </div>
                          )}
                        </div>
                      )}

                      {/* Acknowledgment Notice */}
                      {res.student_acknowledged && (
                        <div style={{ fontSize: '12px', color: '#059669', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>✓</span>
                          <span>You acknowledged this evaluation on {new Date(res.student_acknowledged_at).toLocaleDateString()}.</span>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Unpublished / Pending Evaluation Card */
                    <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--gray-200)', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-800)', marginBottom: '6px' }}>
                        ⏳ Evaluation in Progress
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--gray-600)', lineHeight: '1.5', margin: 0 }}>
                        Your examination attempt was securely recorded on the server. Your course instructor is reviewing submissions. Official marks and written feedback will be displayed here as soon as they are published.
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons (Only when published) */}
                {isPublished && (
                  <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--gray-200)', flexWrap: 'wrap' }}>
                    {!res.student_acknowledged && (
                      <button
                        onClick={() => handleOpenAcknowledge(res.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1 }}
                      >
                        ✓ Acknowledge Feedback
                      </button>
                    )}

                    {!res.clarification_requested && (
                      <button
                        onClick={() => handleOpenClarification(res.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1 }}
                      >
                        Ask Clarification 💬
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledge Feedback Modal */}
      <ConfirmModal
        isOpen={ackModalOpen}
        title="Acknowledge Faculty Feedback"
        message="Confirm that you have reviewed your official exam score and feedback provided by your instructor."
        confirmText={actionLoading ? 'Saving...' : 'Acknowledge Feedback'}
        confirmVariant="success"
        onConfirm={handleConfirmAcknowledge}
        onCancel={() => setAckModalOpen(false)}
      >
        <div className="form-group" style={{ marginTop: '12px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Optional Note / Acknowledgment Message:</label>
          <input
            type="text"
            className="form-control"
            value={ackNotes}
            onChange={(e) => setAckNotes(e.target.value)}
            placeholder="e.g. Thank you for the detailed feedback..."
          />
        </div>
      </ConfirmModal>

      {/* Clarification Request Modal */}
      <ConfirmModal
        isOpen={clarifyModalOpen}
        title="Request Feedback Clarification"
        message="Submit a clarification inquiry to your instructor regarding your exam marks or feedback. Note: Your original exam submission answers remain immutable and cannot be edited."
        confirmText={actionLoading ? 'Sending...' : 'Submit Clarification Request'}
        confirmVariant="primary"
        onConfirm={handleConfirmClarification}
        onCancel={() => setClarifyModalOpen(false)}
      >
        <div className="form-group" style={{ marginTop: '12px' }}>
          <label className="form-label" style={{ fontSize: '12px' }}>Clarification Question / Inquiry *</label>
          <textarea
            required
            rows={3}
            className="form-control"
            value={clarifyMessage}
            onChange={(e) => setClarifyMessage(e.target.value)}
            placeholder="Explain what question or feedback item you would like clarification on..."
          />
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
            Stored separately from your original submission. Your exam answers will not be reopened or modified.
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};
