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

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="card" style={{ padding: '36px' }}>
        <div style={{ borderBottom: '1px solid var(--gray-200)', paddingBottom: '20px', marginBottom: '24px' }}>
          <span className="badge badge-neutral" style={{ marginBottom: '8px' }}>EXAMINATION INSTRUCTIONS</span>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--gray-900)', margin: '4px 0 8px 0' }}>
            {exam.title}
          </h1>
          <p style={{ color: 'var(--gray-600)', fontSize: '14px' }}>
            {exam.description}
          </p>
        </div>

        <div className="grid-3" style={{ marginBottom: '28px' }}>
          <div className="stat-card">
            <span className="stat-label">Duration</span>
            <span className="stat-value">{exam.duration_minutes}m</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Marks</span>
            <span className="stat-value">{exam.total_marks}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Pass Marks</span>
            <span className="stat-value">{exam.pass_marks}</span>
          </div>
        </div>

        <div style={{ background: 'var(--gray-50)', padding: '20px', borderRadius: '8px', border: '1px solid var(--gray-200)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', color: 'var(--gray-900)' }}>
            Rules & Proctoring Guidelines:
          </h3>
          <ul style={{ fontSize: '14px', color: 'var(--gray-700)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.6' }}>
            <li><strong>Server-Authoritative Clock:</strong> Your timer starts the moment you click "Start Exam". If time runs out, the server will automatically submit your attempt.</li>
            <li><strong>Automatic Answer Saving:</strong> Every answer you select or type is continuously autosaved. You can review and change your choices anytime before final submission.</li>
            <li><strong>Accidental Disconnection / Refresh:</strong> If your browser closes or network disconnects temporarily, you can re-open the exam room and resume from where you left off.</li>
            <li><strong>Integrity Monitoring:</strong> Fullscreen mode, tab switches, and webcam permissions are logged for faculty audit. Please stay focused on the exam screen.</li>
          </ul>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <label className="form-check" style={{ fontSize: '14px', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
            />
            <span>I have read and agree to the examination rules and understand that audit events are recorded.</span>
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
