import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export const StudentDashboard = () => {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await studentAPI.getAvailableExams();
        setExams(res.data);
      } catch (err) {
        setError('Failed to load available exams.');
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {user?.first_name || user?.username}</h1>
          <p className="page-subtitle">
            Roll No: {user?.student_profile?.roll_number || 'N/A'} • {user?.student_profile?.department || 'Student Portal'}
          </p>
        </div>
        <Link to="/student/results" className="btn btn-secondary">
          View Released Results
        </Link>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: 'var(--gray-900)' }}>
          Assigned & Scheduled Exams
        </h2>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-500)' }}>
            Loading available examinations...
          </div>
        ) : error ? (
          <div className="card" style={{ color: 'var(--danger)', padding: '20px' }}>
            {error}
          </div>
        ) : exams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-500)' }}>
            <p style={{ fontSize: '16px', fontWeight: '500' }}>No active exams scheduled right now.</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>Check back when your instructors publish tests.</p>
          </div>
        ) : (
          <div className="grid-3">
            {exams.map((exam) => {
              const isSubmitted = exam.attempt_status === 'SUBMITTED' || exam.attempt_status === 'EXPIRED';
              const isInProgress = exam.attempt_status === 'IN_PROGRESS';

              return (
                <div key={exam.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <span className="badge badge-neutral">{exam.duration_minutes} Mins</span>
                      {isSubmitted ? (
                        <span className="badge badge-success">Completed</span>
                      ) : isInProgress ? (
                        <span className="badge badge-warning">In Progress</span>
                      ) : (
                        <span className="badge badge-neutral">Available</span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gray-900)', marginBottom: '8px' }}>
                      {exam.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '16px', lineHeight: '1.5' }}>
                      {exam.description || 'No description provided.'}
                    </p>

                    <div style={{ fontSize: '12px', color: 'var(--gray-500)', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
                      <div>Total Marks: <strong>{exam.total_marks}</strong> (Pass: {exam.pass_marks})</div>
                      <div>Proctoring: <strong>{exam.enable_proctoring ? 'Enabled (Webcam & Tabs)' : 'Standard'}</strong></div>
                      <div>Window Closes: {new Date(exam.end_window).toLocaleString()}</div>
                    </div>
                  </div>

                  <div>
                    {isSubmitted ? (
                      <Link to={`/student/results`} className="btn btn-secondary" style={{ width: '100%' }}>
                        View Result Status
                      </Link>
                    ) : isInProgress ? (
                      <Link to={`/exam/take/${exam.id}`} className="btn btn-warning" style={{ width: '100%', background: '#d97706', color: '#fff' }}>
                        Resume Active Attempt ➜
                      </Link>
                    ) : (
                      <Link to={`/student/exams/${exam.id}/instructions`} className="btn btn-primary" style={{ width: '100%' }}>
                        Read Rules & Start ➜
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
