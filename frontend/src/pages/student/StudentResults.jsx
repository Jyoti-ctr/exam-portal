import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentAPI } from '../../api/client';

export const StudentResults = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await studentAPI.getPublishedResults();
        setResults(res.data);
      } catch (err) {
        setError('Failed to load published exam results.');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Exam Results</h1>
          <p className="page-subtitle">Official scores released by course instructors</p>
        </div>
        <Link to="/student" className="btn btn-secondary">
          ‹ Back to Exams
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-500)' }}>
          Loading your published scores...
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--danger)', padding: '20px' }}>
          {error}
        </div>
      ) : results.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--gray-500)' }}>
          <p style={{ fontSize: '16px', fontWeight: '600' }}>No examination results released yet.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>
            When faculty evaluate and publish scores for your exams, they will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid-3">
          {results.map((res) => (
            <div key={res.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="badge badge-neutral">PUBLISHED</span>
                  {res.passed ? (
                    <span className="badge badge-success">PASSED</span>
                  ) : (
                    <span className="badge badge-danger">FAILED</span>
                  )}
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--gray-900)', marginBottom: '8px' }}>
                  {res.exam_title}
                </h3>

                <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px', margin: '16px 0', border: '1px solid var(--gray-200)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--gray-600)' }}>Total Score:</span>
                    <strong style={{ fontSize: '18px', color: res.passed ? 'var(--success)' : 'var(--danger)' }}>
                      {res.total_score} / {res.exam_total_marks}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--gray-600)' }}>
                    <span>Percentage:</span>
                    <strong>{res.percentage}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--gray-200)' }}>
                    <span>Objective (MCQ):</span>
                    <span>{res.objective_score} marks</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gray-500)' }}>
                    <span>Descriptive:</span>
                    <span>{res.descriptive_score} marks</span>
                  </div>
                </div>

                {res.feedback && (
                  <div style={{ fontSize: '13px', color: 'var(--gray-700)', fontStyle: 'italic', marginBottom: '12px' }}>
                    "{res.feedback}"
                  </div>
                )}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--gray-400)', textAlign: 'right' }}>
                Evaluated: {new Date(res.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
