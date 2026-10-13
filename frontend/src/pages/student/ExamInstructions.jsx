import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { studentAPI } from '../../api/client';

export const ExamInstructions = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const res = await studentAPI.getExamInstructions(examId);
        setExam(res.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Unable to retrieve exam instructions.');
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [examId]);

  const handleStartExam = () => {
    if (!agreed) return;
    navigate(`/exam/take/${examId}`);
  };

  if (loading) {
    return <div className="page-container" style={{ textAlign: 'center', padding: '60px' }}>Loading instructions...</div>;
  }

  if (error || !exam) {
    return (
      <div className="page-container">
        <div className="card" style={{ color: 'var(--danger)', padding: '24px' }}>
          <h3>Error</h3>
          <p>{error || 'Exam not found.'}</p>
          <Link to="/student" className="btn btn-secondary" style={{ marginTop: '16px' }}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const isForwardOnly = exam.navigation_mode === 'FORWARD_ONLY';
  const warningLimit = exam.warning_threshold || 8;

  return (
    <div className="page-container" style={{ maxWidth: '840px' }}>
      <div className="card" style={{ padding: '36px' }}>
        <div style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: '20px', marginBottom: '24px' }}>
          <span className="badge badge-neutral" style={{ marginBottom: '8px' }}>EXAMINATION INSTRUCTIONS & RULES</span>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--gray-900)', margin: '4px 0 8px 0' }}>
            {exam.title}
          </h1>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px' }}>
            {exam.description || 'Please review all rules, navigation policies, and integrity guidelines carefully before commencing your attempt.'}
          </p>
        </div>

        {/* Highlighted Navigation Policy Box */}
        <div
          style={{
            background: isForwardOnly ? '#eff6ff' : '#f0fdf4',
            border: isForwardOnly ? '2px solid #3b82f6' : '2px solid #22c55e',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>{isForwardOnly ? '➡️' : '⇄'}</span>
            <strong style={{ fontSize: '15px', color: isForwardOnly ? '#1e40af' : '#15803d' }}>
              {isForwardOnly ? 'Question Navigation: Forward Only' : 'Question Navigation: Forward and Backward'}
            </strong>
          </div>
          <p style={{ fontSize: '14px', color: isForwardOnly ? '#1e3a8a' : '#166534', margin: 0, lineHeight: '1.5' }}>
            {isForwardOnly ? (
              <>
                <strong>Question Navigation: Forward Only.</strong> You can move to the next question, but once you leave a question, you cannot return to it. Check your answer before proceeding.
              </>
            ) : (
              <>
                <strong>Question Navigation: Forward and Backward.</strong> You can revisit previous questions and change your answers until you submit the exam or time expires.
              </>
            )}
          </p>
        </div>

        {/* Exam Overview Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
          <div className="stat-card">
            <span className="stat-label">Duration</span>
            <span className="stat-value">{exam.duration_minutes}m</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Questions</span>
            <span className="stat-value">{exam.question_count || 'Configured'}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Marks</span>
            <span className="stat-value">{exam.total_marks}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Negative Marks</span>
            <span className="stat-value" style={{ fontSize: '16px', color: exam.has_negative_marking ? 'var(--danger)' : 'var(--success)' }}>
              {exam.has_negative_marking ? 'Yes (Applicable)' : 'None'}
            </span>
          </div>
        </div>

        {/* Warning Policy Box */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '20px', borderRadius: '8px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> Warning Policy & Automatic Submission Rule
          </h3>
          <ul style={{ fontSize: '13.5px', color: '#78350f', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: '1.5' }}>
            <li>
              <strong>Violation Monitoring:</strong> The student receives an authoritative warning each time a qualifying exam violation is detected (leaving the exam tab, losing window focus, exiting fullscreen mode, or camera interruptions).
            </li>
            <li>
              <strong>Warning 1 through Warning {warningLimit}:</strong> You may continue the exam subject to the standard exam rules.
            </li>
            <li>
              <strong>Warning {warningLimit} (Final Warning):</strong> A prominent alert will notify you that exactly one more qualifying violation will trigger automatic submission.
            </li>
            <li>
              <strong>Warning {warningLimit + 1} (Automatic Final Submission):</strong> If the warning count exceeds {warningLimit}, the server will <strong>automatically submit the exam immediately</strong> and lock all answers from further changes.
            </li>
            {exam.is_camera_mandatory && (
              <li>
                <strong>Mandatory Camera Requirement:</strong> Webcam monitoring is mandatory for this exam. Disconnecting or revoking camera access counts as a qualifying violation.
              </li>
            )}
          </ul>
        </div>

        {/* General Guidelines */}
        <div style={{ background: 'var(--gray-50)', padding: '20px', borderRadius: '8px', border: '1px solid var(--gray-200)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '10px', color: 'var(--gray-900)' }}>
            Exam Session Guidelines:
          </h3>
          <ul style={{ fontSize: '13.5px', color: 'var(--gray-700)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: '1.5' }}>
            <li><strong>Server-Authoritative Clock:</strong> Your timer starts the moment you click "Start Exam". If time expires, the server automatically finalizes submission.</li>
            <li><strong>Continuous Autosave:</strong> Every choice or text entered is autosaved on the server.</li>
            <li><strong>Technical Issues:</strong> Ordinary network glitches or brief reconnections do not count as cheating. If your connection drops, refresh to resume.</li>
          </ul>
        </div>

        {/* Student Acknowledgment */}
        <div style={{ marginBottom: '28px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
          <label className="form-check" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
            />
            <span>
              I have read and acknowledge the examination navigation rules ({isForwardOnly ? 'Forward Only' : 'Forward and Backward'}) and the {warningLimit}-warning automatic submission policy.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/student" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            onClick={handleStartExam}
            disabled={!agreed}
            className="btn btn-primary btn-lg"
          >
            Start Exam Now ➜
          </button>
        </div>
      </div>
    </div>
  );
};
