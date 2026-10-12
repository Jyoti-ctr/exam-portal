import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { stopAllCameraStreams } from '../../utils/cameraManager';

export const SubmissionSuccess = () => {
  const location = useLocation();
  const { examTitle, submittedAt, isAuto } = location.state || {};

  useEffect(() => {
    // Explicit safety assurance: unconditionally stop every camera stream on completion
    stopAllCameraStreams();
  }, []);

  return (
    <div className="page-container" style={{ maxWidth: '600px', marginTop: '60px' }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--success-bg)', borderRadius: '50%', marginBottom: '16px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--gray-900)', marginBottom: '8px' }}>
          {isAuto ? 'Exam Time Expired & Submitted' : 'Exam Successfully Submitted!'}
        </h1>

        <p style={{ color: 'var(--gray-600)', fontSize: '15px', marginBottom: '24px' }}>
          Your responses for <strong>{examTitle || 'the examination'}</strong> have been securely recorded on the server.
        </p>

        <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', marginBottom: '28px', fontSize: '13px', color: 'var(--gray-600)' }}>
          <div>Submission Time: <strong>{submittedAt || new Date().toLocaleTimeString()}</strong></div>
          <div style={{ marginTop: '6px' }}>Status: <strong>Recorded & Under Evaluation</strong></div>
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--gray-500)' }}>
            Results will be accessible on your dashboard once published by your course faculty.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link to="/student" className="btn btn-primary">
            Back to Dashboard
          </Link>
          <Link to="/student/results" className="btn btn-secondary">
            View Results Portal
          </Link>
        </div>
      </div>
    </div>
  );
};
