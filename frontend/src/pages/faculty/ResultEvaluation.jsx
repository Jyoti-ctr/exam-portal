import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Submitted', badgeClass: 'badge-neutral', color: '#64748b' },
  PENDING_REVIEW: { label: 'Pending Review', badgeClass: 'badge-warning', color: '#f59e0b' },
  UNDER_REVIEW: { label: 'Under Review', badgeClass: 'badge-warning', color: '#8b5cf6' },
  FLAGGED: { label: 'Flagged for Investigation', badgeClass: 'badge-danger', color: '#ef4444' },
  REVIEWED: { label: 'Reviewed', badgeClass: 'badge-success', color: '#0ea5e9' },
  PUBLISHED: { label: 'Published', badgeClass: 'badge-success', color: '#10b981' },
  RETURNED_FOR_CLARIFICATION: { label: 'Clarification Requested', badgeClass: 'badge-warning', color: '#f97316' },
};

export const ResultEvaluation = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Review Workspace Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDetail, setReviewDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Review Form States
  const [marksState, setMarksState] = useState({});
  const [commentsState, setCommentsState] = useState({});
  const [facultyFeedback, setFacultyFeedback] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [clarificationResponse, setClarificationResponse] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'history'

  // Flag Modal State
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [targetAttemptId, setTargetAttemptId] = useState(null);

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const [examRes, subsRes] = await Promise.all([
        facultyAPI.getExam(examId),
        facultyAPI.getSubmissions(examId),
      ]);
      setExam(examRes.data);
      setSubmissions(subsRes.data);
    } catch {
      alert('Failed to load examination submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [examId]);

  const handleOpenReview = async (attemptId) => {
    setLoadingDetail(true);
    setReviewModalOpen(true);
    setActiveTab('questions');

    try {
      const res = await facultyAPI.getReviewDetail(attemptId);
      const data = res.data;
      setReviewDetail(data);

      // Pre-fill existing marks and comments
      const initMarks = {};
      const initComments = {};
      (data.questions || []).forEach((q) => {
        if (q.student_answer) {
          if (q.student_answer.awarded_marks !== null && q.student_answer.awarded_marks !== undefined) {
            initMarks[q.student_answer.id] = q.student_answer.awarded_marks;
          }
          if (q.student_answer.evaluator_comment) {
            initComments[q.student_answer.id] = q.student_answer.evaluator_comment;
          }
        }
      });
      setMarksState(initMarks);
      setCommentsState(initComments);
      setFacultyFeedback(data.result?.feedback || '');
      setInternalNotes(data.result?.internal_notes || '');
      setClarificationResponse(data.result?.clarification_response_text || '');
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to open submission review workspace.');
      setReviewModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSaveReview = async (targetStatus) => {
    if (!reviewDetail?.attempt?.id) return;

    // Validate marks before sending
    for (const q of reviewDetail.questions || []) {
      const isManual = q.manual_grading || q.question_type === 'DESCRIPTIVE' || q.question_type === 'CODE';
      if (isManual && q.student_answer?.id) {
        const val = marksState[q.student_answer.id];
        if (val !== undefined && val !== '') {
          const num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > q.marks) {
            alert(`Marks for Question ${q.order} must be between 0 and maximum ${q.marks}.`);
            return;
          }
        }
      }
    }

    setSavingReview(true);
    try {
      await facultyAPI.saveReview(reviewDetail.attempt.id, {
        review_status: targetStatus,
        descriptive_marks: marksState,
        answer_comments: commentsState,
        faculty_feedback: facultyFeedback,
        internal_notes: internalNotes,
      });

      alert(`Review ${targetStatus === 'REVIEWED' ? 'finalized' : 'saved as draft'} successfully!`);
      // Reload review details & list
      const res = await facultyAPI.getReviewDetail(reviewDetail.attempt.id);
      setReviewDetail(res.data);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save review.');
    } finally {
      setSavingReview(false);
    }
  };

  const handlePublishReview = async (attemptId) => {
    try {
      await facultyAPI.publishReview(attemptId);
      alert('Official results and feedback have been published to the student!');
      if (reviewModalOpen && reviewDetail?.attempt?.id === attemptId) {
        const res = await facultyAPI.getReviewDetail(attemptId);
        setReviewDetail(res.data);
      }
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to publish results.');
    }
  };

  const handleOpenFlagModal = (attemptId) => {
    setTargetAttemptId(attemptId);
    setFlagReason('');
    setFlagModalOpen(true);
  };

  const handleConfirmFlag = async () => {
    if (!flagReason.trim()) {
      alert('Please provide a reason for flagging this submission.');
      return;
    }
    try {
      await facultyAPI.flagSubmission(targetAttemptId, {
        flag_reason: flagReason.trim(),
        notes: 'Flagged via Faculty Review Workspace',
      });
      alert('Submission flagged for investigation. Academic marks are preserved.');
      setFlagModalOpen(false);
      if (reviewModalOpen && reviewDetail?.attempt?.id === targetAttemptId) {
        const res = await facultyAPI.getReviewDetail(targetAttemptId);
        setReviewDetail(res.data);
      }
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to flag submission.');
    }
  };

  const handleSendClarification = async () => {
    if (!clarificationResponse.trim()) {
      alert('Please enter a response for the student.');
      return;
    }
    try {
      await facultyAPI.respondClarification(reviewDetail.attempt.id, {
        response_text: clarificationResponse.trim(),
      });
      alert('Clarification response sent to student.');
      const res = await facultyAPI.getReviewDetail(reviewDetail.attempt.id);
      setReviewDetail(res.data);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send clarification response.');
    }
  };

  const handleBatchPublish = async (shouldPublish) => {
    try {
      await facultyAPI.publishResults(examId, shouldPublish);
      alert(`All submissions ${shouldPublish ? 'published' : 'hidden'} successfully.`);
      loadData();
    } catch {
      alert('Failed to update publication status.');
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filterStatus === 'ALL') return true;
    return s.review_status === filterStatus;
  });

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
            Marking & Review Workflow: {exam?.title || 'Exam'}
          </h1>
          <p className="page-subtitle">
            Evaluate submitted student answers, award marks, record written feedback, and release official grades
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleBatchPublish(true)}
            className="btn btn-success"
            title="Publish all graded results to students"
          >
            Publish All Results 📢
          </button>
        </div>
      </div>

      {/* Filter Status Pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {['ALL', 'SUBMITTED', 'PENDING_REVIEW', 'UNDER_REVIEW', 'FLAGGED', 'REVIEWED', 'PUBLISHED', 'RETURNED_FOR_CLARIFICATION'].map((st) => {
          const isActive = filterStatus === st;
          const count = st === 'ALL' ? submissions.length : submissions.filter((s) => s.review_status === st).length;
          const config = STATUS_CONFIG[st];

          return (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {st === 'ALL' ? 'All Submissions' : config?.label || st} ({count})
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>
            Loading student submissions...
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
            <p style={{ fontSize: '16px', fontWeight: '500' }}>No submissions matching this filter.</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>Student submissions will appear here once submitted.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Submission Time</th>
                  <th>Review Status</th>
                  <th>Objective (MCQ)</th>
                  <th>Descriptive</th>
                  <th>Total Score</th>
                  <th>Public Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((sub) => {
                  const cfg = STATUS_CONFIG[sub.review_status] || STATUS_CONFIG.SUBMITTED;

                  return (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--gray-900)' }}>
                          {sub.student_name || sub.student_username}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                          Roll No: {sub.roll_number || 'N/A'} • @{sub.student_username}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          <span className={`badge ${(sub.warning_count || 0) >= 8 ? 'badge-danger' : (sub.warning_count || 0) > 0 ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '10px' }}>
                            ⚠️ {sub.warning_count || 0} Warnings
                          </span>
                          {sub.submission_reason === 'warning_threshold_exceeded' && (
                            <span className="badge badge-danger" style={{ fontSize: '10px' }}>
                              Auto (8+ Warnings)
                            </span>
                          )}
                          {sub.submission_reason === 'time_expired' && (
                            <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                              Auto (Timeout)
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                        {new Date(sub.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>

                      <td>
                        <span
                          className={`badge ${cfg.badgeClass}`}
                          style={{
                            background: sub.review_status === 'FLAGGED' ? '#fee2e2' : undefined,
                            color: sub.review_status === 'FLAGGED' ? '#b91c1c' : undefined,
                          }}
                        >
                          {cfg.label}
                        </span>
                        {sub.clarification_requested && (
                          <div style={{ fontSize: '11px', color: '#f97316', marginTop: '4px', fontWeight: '600' }}>
                            💬 Clarification Request
                          </div>
                        )}
                      </td>

                      <td>{sub.objective_score} pts</td>
                      <td>{sub.descriptive_score} pts</td>

                      <td>
                        <strong style={{ fontSize: '15px', color: sub.passed ? 'var(--success)' : 'var(--danger)' }}>
                          {sub.total_score} / {sub.exam_total_marks}
                        </strong>
                        <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                          ({sub.percentage}%) {sub.passed ? 'PASS' : 'FAIL'}
                        </div>
                      </td>

                      <td>
                        {sub.is_published ? (
                          <span className="badge badge-success">Published 📢</span>
                        ) : (
                          <span className="badge badge-neutral">Private / Draft</span>
                        )}
                        {sub.student_acknowledged && (
                          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
                            ✓ Acknowledged by student
                          </div>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenReview(sub.attempt)}
                            className="btn btn-primary btn-sm"
                            title="Evaluate and mark answers"
                          >
                            Mark & Review 📝
                          </button>

                          {!sub.is_published && (
                            <button
                              onClick={() => handlePublishReview(sub.attempt)}
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#059669', borderColor: '#10b981' }}
                              title="Publish results to student"
                            >
                              Publish 📢
                            </button>
                          )}

                          {sub.review_status !== 'FLAGGED' && (
                            <button
                              onClick={() => handleOpenFlagModal(sub.attempt)}
                              className="btn btn-secondary btn-sm"
                              style={{ color: '#b91c1c' }}
                              title="Flag for investigation"
                            >
                              Flag ⚠️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Workspace Modal */}
      {reviewModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', width: '95%' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid var(--gray-200)', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>
                    Submission Review & Marking
                  </h2>
                  {reviewDetail?.result && (
                    <span className={`badge ${STATUS_CONFIG[reviewDetail.result.review_status]?.badgeClass || 'badge-neutral'}`}>
                      {STATUS_CONFIG[reviewDetail.result.review_status]?.label || reviewDetail.result.review_status}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray-600)', marginTop: '4px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Student: <strong>{reviewDetail?.attempt?.student_name}</strong> (Roll: {reviewDetail?.attempt?.roll_number || 'N/A'}) • Attempt #{reviewDetail?.attempt?.attempt_number} • Submitted: {reviewDetail?.attempt?.submitted_at ? new Date(reviewDetail.attempt.submitted_at).toLocaleString() : 'N/A'}</span>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                    ⚠️ Warnings: {reviewDetail?.attempt?.warning_count || 0} / {reviewDetail?.exam?.warning_threshold || 8}
                  </span>
                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                    Navigation: {reviewDetail?.exam?.navigation_mode === 'FORWARD_ONLY' ? 'Forward Only' : 'Forward & Backward'}
                  </span>
                  {reviewDetail?.attempt?.submission_reason && (
                    <span className={`badge ${reviewDetail?.attempt?.submission_reason === 'warning_threshold_exceeded' ? 'badge-danger' : reviewDetail?.attempt?.submission_reason === 'time_expired' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '11px' }}>
                      Reason: {reviewDetail.attempt.submission_reason}
                    </span>
                  )}
                </div>
              </div>

              <button onClick={() => setReviewModalOpen(false)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>

            {loadingDetail ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>
                Loading submission answers and history...
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '6px' }}>
                {/* Flag Banner if Flagged */}
                {reviewDetail?.result?.review_status === 'FLAGGED' && (
                  <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px', padding: '14px 18px', color: '#991b1b' }}>
                    <div style={{ fontWeight: '800', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>⚠️ SUBMISSION FLAGGED FOR INTEGRITY INVESTIGATION</span>
                    </div>
                    <div style={{ fontSize: '13px', marginTop: '6px' }}>
                      <strong>Reason:</strong> {reviewDetail.result.flag_reason || 'Under review for potential exam anomaly.'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', color: '#7f1d1d' }}>
                      Note: Academic grading and points are maintained independently of the investigation decision.
                    </div>
                  </div>
                )}

                {/* Clarification Request Banner */}
                {reviewDetail?.result?.clarification_requested && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '14px 18px', color: '#92400e' }}>
                    <div style={{ fontWeight: '800', fontSize: '14px' }}>
                      💬 Student Clarification Request
                    </div>
                    <p style={{ fontSize: '13px', margin: '6px 0 12px 0', fontStyle: 'italic', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                      "{reviewDetail.result.clarification_request_text}"
                    </p>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontSize: '12px' }}>Your Instructor Response:</label>
                        <textarea
                          rows={2}
                          className="form-control"
                          value={clarificationResponse}
                          onChange={(e) => setClarificationResponse(e.target.value)}
                          placeholder="Type explanation or guidance for the student..."
                        />
                      </div>
                      <button
                        onClick={handleSendClarification}
                        className="btn btn-warning btn-sm"
                        style={{ height: '38px', background: '#d97706', color: '#fff' }}
                      >
                        Send Clarification Response
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab Navigation */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', gap: '16px' }}>
                  <button
                    onClick={() => setActiveTab('questions')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 4px',
                      fontSize: '14px',
                      fontWeight: activeTab === 'questions' ? '700' : '500',
                      color: activeTab === 'questions' ? 'var(--primary)' : 'var(--gray-500)',
                      borderBottom: activeTab === 'questions' ? '2px solid var(--primary)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Submitted Answers ({reviewDetail?.questions?.length || 0})
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 4px',
                      fontSize: '14px',
                      fontWeight: activeTab === 'history' ? '700' : '500',
                      color: activeTab === 'history' ? 'var(--primary)' : 'var(--gray-500)',
                      borderBottom: activeTab === 'history' ? '2px solid var(--primary)' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Audit Trail & History ({reviewDetail?.result?.history?.length || 0})
                  </button>
                </div>

                {activeTab === 'questions' ? (
                  <>
                    {/* Questions & Answers List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {(reviewDetail?.questions || []).map((q) => {
                        const ans = q.student_answer || {};
                        const isSingleChoice = q.question_type === 'MCQ' || q.question_type === 'TRUE_FALSE';
                        const isMultipleSelect = q.question_type === 'MULTIPLE_SELECT';
                        const isNumerical = q.question_type === 'NUMERICAL';
                        const isBlanks = q.question_type === 'FILL_IN_BLANKS';
                        const isMatching = q.question_type === 'MATCHING';
                        const isCode = q.question_type === 'CODE';
                        const isDescriptive = q.question_type === 'DESCRIPTIVE';
                        const isShortAnswer = q.question_type === 'SHORT_ANSWER';
                        const isImageBased = q.question_type === 'IMAGE_BASED';
                        const isManual = q.manual_grading || isDescriptive || isCode;

                        return (
                          <div
                            key={q.id}
                            style={{
                              border: '1px solid var(--gray-200)',
                              borderRadius: '8px',
                              padding: '16px',
                              background: '#fff',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--primary)' }}>
                                  QUESTION {q.order} • {q.question_type.replace(/_/g, ' ')}
                                </span>
                                {isManual ? (
                                  <span className="badge badge-warning" style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309' }}>
                                    Manual Grading
                                  </span>
                                ) : (
                                  <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                                    Auto-Graded
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--gray-700)' }}>
                                Max {q.marks} Marks {q.negative_marks > 0 ? `(-${q.negative_marks} neg)` : ''}
                              </span>
                            </div>

                            {/* Image if Image-Based or attached */}
                            {(q.image || q.image_url) && (
                              <div style={{ marginBottom: '12px' }}>
                                <img
                                  src={q.image || q.image_url}
                                  alt="Question diagram"
                                  style={{ maxHeight: '250px', maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--gray-200)' }}
                                />
                              </div>
                            )}

                            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '12px' }}>
                              {q.question_text}
                            </div>

                            {/* 1 & 3: Single Choice (MCQ & True/False) */}
                            {isSingleChoice && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                {(q.options || []).map((opt) => (
                                  <div
                                    key={opt.id}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      background: opt.is_selected
                                        ? opt.is_correct
                                          ? '#ecfdf5'
                                          : '#fef2f2'
                                        : '#f8fafc',
                                      border: opt.is_selected
                                        ? opt.is_correct
                                          ? '1px solid #10b981'
                                          : '1px solid #ef4444'
                                        : '1px solid var(--gray-200)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span>{opt.is_selected ? '●' : '○'}</span>
                                      <span>{opt.option_text}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', fontWeight: '700' }}>
                                      {opt.is_selected && (
                                        <span style={{ marginRight: '8px', color: opt.is_correct ? '#059669' : '#dc2626' }}>
                                          [Student Selected]
                                        </span>
                                      )}
                                      {opt.is_correct && (
                                        <span style={{ color: '#059669' }}>✓ Correct Answer</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 2: Multiple Select */}
                            {isMultipleSelect && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                {(() => {
                                  const selectedIds = (ans.answer_data?.selected_option_ids || []).map(Number);
                                  return (q.options || []).map((opt) => {
                                    const isSel = selectedIds.includes(Number(opt.id)) || opt.is_selected;
                                    return (
                                      <div
                                        key={opt.id}
                                        style={{
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          fontSize: '13px',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          background: isSel
                                            ? opt.is_correct
                                              ? '#ecfdf5'
                                              : '#fef2f2'
                                            : '#f8fafc',
                                          border: isSel
                                            ? opt.is_correct
                                              ? '1px solid #10b981'
                                              : '1px solid #ef4444'
                                            : '1px solid var(--gray-200)',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span>{isSel ? '☑' : '☐'}</span>
                                          <span>{opt.option_text}</span>
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: '700' }}>
                                          {isSel && (
                                            <span style={{ marginRight: '8px', color: opt.is_correct ? '#059669' : '#dc2626' }}>
                                              [Student Selected]
                                            </span>
                                          )}
                                          {opt.is_correct && (
                                            <span style={{ color: '#059669' }}>✓ Correct Option</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            )}

                            {/* 8: Numerical Answer */}
                            {isNumerical && (
                              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--gray-200)', marginBottom: '12px', fontSize: '13px' }}>
                                <div>Student Answer: <strong>{ans.answer_data?.numerical_value ?? ans.text_response ?? <em style={{ color: 'var(--gray-400)' }}>None</em>}</strong></div>
                                <div style={{ color: 'var(--gray-600)', marginTop: '4px' }}>
                                  Target Answer: <strong>{q.correct_answer_data?.value}</strong> (Tolerance: ±{q.correct_answer_data?.tolerance || 0})
                                </div>
                              </div>
                            )}

                            {/* 6: Fill in the Blanks */}
                            {isBlanks && (
                              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--gray-200)', marginBottom: '12px', fontSize: '13px' }}>
                                <div style={{ fontWeight: '700', marginBottom: '6px' }}>Student Responses:</div>
                                {(ans.answer_data?.blanks || (ans.text_response ? [ans.text_response] : [])).map((b, idx) => (
                                  <div key={idx} style={{ marginTop: '2px' }}>
                                    Blank #{idx + 1}: <strong>{b || <em style={{ color: 'var(--gray-400)' }}>Empty</em>}</strong>
                                    <span style={{ color: 'var(--gray-500)', marginLeft: '8px' }}>
                                      (Accepted: {(q.correct_answer_data?.blanks?.[idx]?.accepted || []).join(' / ') || 'N/A'})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* 7: Matching */}
                            {isMatching && (
                              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--gray-200)', marginBottom: '12px', fontSize: '13px' }}>
                                <div style={{ fontWeight: '700', marginBottom: '6px' }}>Student Matches:</div>
                                {Object.entries(ans.answer_data?.matches || {}).map(([l, r], idx) => {
                                  const targetMatch = (q.correct_answer_data?.pairs || []).find(p => p.left === l)?.right;
                                  const isCorrect = targetMatch === r;
                                  return (
                                    <div key={idx} style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      <span>{l} ➔ <strong>{r}</strong></span>
                                      {isCorrect ? (
                                        <span style={{ color: '#059669', fontSize: '11px', fontWeight: '700' }}>✓ Correct</span>
                                      ) : (
                                        <span style={{ color: '#dc2626', fontSize: '11px' }}>✗ Expected: {targetMatch || '—'}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* 10: Code Question */}
                            {isCode && (
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Submitted Code:
                                </div>
                                <pre style={{ background: '#0f172a', color: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                  <code>{ans.answer_data?.code || ans.text_response || '// No code submitted.'}</code>
                                </pre>
                              </div>
                            )}

                            {/* 5: Descriptive or Short Answer (without choices) */}
                            {(isDescriptive || (isShortAnswer && !q.options?.length) || (isImageBased && !q.options?.length)) && (
                              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--gray-200)', marginBottom: '14px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>
                                  Student Written Submission:
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--gray-900)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                  {ans.text_response || ans.answer_data?.text_response || <em style={{ color: 'var(--gray-400)' }}>No response provided for this question.</em>}
                                </div>
                              </div>
                            )}

                            {/* Scoring & Feedback Controls */}
                            {isManual ? (
                              ans.id ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '14px', alignItems: 'flex-start', background: '#f0fdf4', padding: '12px 16px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                  <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>
                                      Marks (0 to {q.marks}) *
                                    </label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max={q.marks}
                                      className="form-control"
                                      value={marksState[ans.id] !== undefined ? marksState[ans.id] : ''}
                                      onChange={(e) => setMarksState((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                                      placeholder={`0 - ${q.marks}`}
                                    />
                                  </div>

                                  <div className="form-group" style={{ margin: 0 }}>
                                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>
                                      Question Feedback (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={commentsState[ans.id] !== undefined ? commentsState[ans.id] : ''}
                                      onChange={(e) => setCommentsState((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                                      placeholder="Specific feedback on this response..."
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: '12px', color: 'var(--gray-500)', fontStyle: 'italic' }}>
                                  No student response was submitted to grade for this question.
                                </div>
                              )
                            ) : (
                              <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '4px' }}>
                                Auto-calculated Score: <strong>{ans.awarded_marks !== null && ans.awarded_marks !== undefined ? `${ans.awarded_marks} / ${q.marks}` : `0 / ${q.marks}`}</strong>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Overall Written Feedback & Internal Notes Section */}
                    <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: 'var(--gray-900)' }}>
                        Overall Review Feedback & Academic Decision
                      </h3>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">
                          Written Student Feedback (Visible to student once published):
                        </label>
                        <textarea
                          rows={3}
                          className="form-control"
                          value={facultyFeedback}
                          onChange={(e) => setFacultyFeedback(e.target.value)}
                          placeholder="Provide constructive feedback, notes on performance, or exam summary..."
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ color: 'var(--gray-600)' }}>
                          Internal Grading Notes (Private / Confidential to Faculty & Admins):
                        </label>
                        <textarea
                          rows={2}
                          className="form-control"
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          placeholder="Internal observations, integrity notes, or moderation remarks..."
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* History Audit Tab */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(reviewDetail?.result?.history || []).length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-500)' }}>
                        No review actions recorded yet for this submission.
                      </div>
                    ) : (
                      (reviewDetail?.result?.history || []).map((h) => (
                        <div
                          key={h.id}
                          style={{
                            background: '#fff',
                            border: '1px solid var(--gray-200)',
                            borderRadius: '6px',
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--gray-900)' }}>
                              Action: {h.action} • {h.previous_status} ➔ {h.new_status}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '2px' }}>
                              Reviewer: <strong>{h.reviewer_name || h.reviewer_username || 'System'}</strong>
                            </div>
                            {h.notes && (
                              <div style={{ fontSize: '12px', color: 'var(--gray-700)', fontStyle: 'italic', marginTop: '4px' }}>
                                "{h.notes}"
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                            {new Date(h.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Modal Bottom Action Bar */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSaveReview('UNDER_REVIEW')}
                  disabled={savingReview || loadingDetail}
                  className="btn btn-secondary"
                >
                  Save Draft Review
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveReview('REVIEWED')}
                  disabled={savingReview || loadingDetail}
                  className="btn btn-primary"
                >
                  Complete Review ✓
                </button>

                <button
                  type="button"
                  onClick={() => handlePublishReview(reviewDetail?.attempt?.id)}
                  disabled={savingReview || loadingDetail}
                  className="btn btn-success"
                >
                  Finalize & Publish 📢
                </button>
              </div>

              <div>
                {reviewDetail?.result?.review_status !== 'FLAGGED' && (
                  <button
                    type="button"
                    onClick={() => handleOpenFlagModal(reviewDetail?.attempt?.id)}
                    className="btn btn-secondary"
                    style={{ color: '#b91c1c' }}
                  >
                    Flag Submission ⚠️
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flag Submission Modal */}
      <ConfirmModal
        isOpen={flagModalOpen}
        title="⚠️ Flag Submission for Investigation"
        message="Flagging this submission indicates potential academic or proctoring irregularities that require further review. Note: Academic marks are preserved and not zeroed out."
        confirmText="Flag Submission"
        confirmVariant="danger"
        onConfirm={handleConfirmFlag}
        onCancel={() => setFlagModalOpen(false)}
      >
        <div className="form-group" style={{ marginTop: '12px' }}>
          <label className="form-label">Investigation Reason *</label>
          <textarea
            required
            rows={3}
            className="form-control"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Describe the reason for investigation (e.g. repeated multiple face anomalies, unauthorized browser blur, suspicious answer timing)..."
          />
        </div>
      </ConfirmModal>
    </div>
  );
};
