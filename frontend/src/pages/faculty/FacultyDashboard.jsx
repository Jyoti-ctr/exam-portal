import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';

export const FacultyDashboard = () => {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteModalId, setDeleteModalId] = useState(null);

  const fetchExams = async () => {
    try {
      setLoading(true);
      const res = await facultyAPI.getExams();
      setExams(res.data);
    } catch {
      setError('Failed to fetch faculty exams.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleTogglePublish = async (examId) => {
    try {
      await facultyAPI.togglePublish(examId);
      fetchExams();
    } catch {
      alert('Failed to update publication status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteModalId) return;
    try {
      await facultyAPI.deleteExam(deleteModalId);
      setDeleteModalId(null);
      fetchExams();
    } catch {
      alert('Failed to delete exam.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty Exam Management</h1>
          <p className="page-subtitle">
            Logged in as {user?.first_name || user?.username} ({user?.faculty_profile?.employee_id || 'Faculty'}) • {user?.faculty_profile?.department || 'Administration'}
          </p>
        </div>
        <Link to="/faculty/exams/new" className="btn btn-primary">
          + Create New Exam
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <span className="stat-label">Total Exams</span>
          <span className="stat-value">{exams.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Published</span>
          <span className="stat-value">{exams.filter((e) => e.is_published).length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Draft / Hidden</span>
          <span className="stat-value">{exams.filter((e) => !e.is_published).length}</span>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>All Examination Records</h2>
          <button onClick={fetchExams} className="btn btn-secondary btn-sm">Refresh List</button>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray-500)' }}>
            Loading exams...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', color: 'var(--danger)' }}>{error}</div>
        ) : exams.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>
            <p>No exams created yet.</p>
            <Link to="/faculty/exams/new" className="btn btn-primary btn-sm" style={{ marginTop: '12px' }}>
              Create your first exam
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Exam Title</th>
                  <th>Duration</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--gray-900)' }}>{exam.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        Closes: {new Date(exam.end_window).toLocaleDateString()}
                      </div>
                    </td>
                    <td>{exam.duration_minutes} mins</td>
                    <td>{exam.question_count}</td>
                    <td>{exam.total_marks}</td>
                    <td>
                      <button
                        onClick={() => handleTogglePublish(exam.id)}
                        className={`badge ${exam.is_published ? 'badge-success' : 'badge-neutral'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="Click to toggle publication"
                      >
                        {exam.is_published ? '● PUBLISHED' : '○ DRAFT'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Link to={`/faculty/exams/${exam.id}/questions`} className="btn btn-secondary btn-sm">
                          Questions ({exam.question_count})
                        </Link>
                        <Link to={`/faculty/exams/${exam.id}/attempts`} className="btn btn-secondary btn-sm">
                          Attempts
                        </Link>
                        <Link to={`/faculty/exams/${exam.id}/results`} className="btn btn-secondary btn-sm">
                          Results & Grade
                        </Link>
                        <Link to={`/faculty/exams/${exam.id}/edit`} className="btn btn-secondary btn-sm">
                          Edit
                        </Link>
                        <button
                          onClick={() => setDeleteModalId(exam.id)}
                          className="btn btn-outline-danger btn-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteModalId}
        title="Confirm Exam Deletion"
        message="Are you sure you want to delete this exam? All associated questions, student attempts, and results will be permanently removed."
        confirmText="Delete Exam"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalId(null)}
      />
    </div>
  );
};
