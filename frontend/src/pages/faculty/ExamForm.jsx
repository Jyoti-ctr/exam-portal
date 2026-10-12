import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';

export const ExamForm = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!examId;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_minutes: 60,
    total_marks: 50.0,
    pass_marks: 20.0,
    max_attempts: 1,
    allow_retake: false,
    start_window: '',
    end_window: '',
    shuffle_questions: false,
    shuffle_options: false,
    enable_proctoring: true,
    is_published: false,
  });

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isEditing) {
      const fetchExam = async () => {
        try {
          const res = await facultyAPI.getExam(examId);
          const data = res.data;
          setFormData({
            title: data.title,
            description: data.description || '',
            duration_minutes: data.duration_minutes,
            total_marks: data.total_marks,
            pass_marks: data.pass_marks,
            max_attempts: data.max_attempts || 1,
            allow_retake: !!data.allow_retake,
            start_window: data.start_window ? data.start_window.slice(0, 16) : '',
            end_window: data.end_window ? data.end_window.slice(0, 16) : '',
            shuffle_questions: data.shuffle_questions,
            shuffle_options: data.shuffle_options,
            enable_proctoring: data.enable_proctoring,
            is_published: data.is_published,
          });
        } catch {
          setError('Failed to load exam details.');
        } finally {
          setLoading(false);
        }
      };
      fetchExam();
    } else {
      // Default dates: start now, end in 7 days (local time for datetime-local inputs)
      const toLocalISO = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const now = new Date();
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setFormData((prev) => ({
        ...prev,
        start_window: toLocalISO(now),
        end_window: toLocalISO(in7Days),
      }));
    }
  }, [examId, isEditing]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await facultyAPI.updateExam(examId, formData);
      } else {
        const res = await facultyAPI.createExam(formData);
        navigate(`/faculty/exams/${res.data.id}/questions`);
        return;
      }
      navigate('/faculty');
    } catch (err) {
      const msg = err.response?.data?.non_field_errors?.[0] || 'Error saving exam. Please check your inputs.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-container" style={{ textAlign: 'center', padding: '60px' }}>Loading form...</div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--gray-200)', paddingBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--gray-900)', margin: '0 0 4px 0' }}>
            {isEditing ? 'Edit Examination Settings' : 'Create New Examination'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            Configure schedules, duration limits, passing marks, and integrity settings.
          </p>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '12px', borderRadius: '6px', fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Exam Title *</label>
            <input
              type="text"
              name="title"
              required
              className="form-control"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. CS401: Distributed Systems Endterm Exam"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Instructions</label>
            <textarea
              name="description"
              className="form-control"
              value={formData.description}
              onChange={handleChange}
              placeholder="Provide instructions, syllabus covered, or rules..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Duration (Minutes) *</label>
              <input
                type="number"
                name="duration_minutes"
                min="1"
                required
                className="form-control"
                value={formData.duration_minutes}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Total Marks *</label>
              <input
                type="number"
                step="0.5"
                name="total_marks"
                min="0"
                required
                className="form-control"
                value={formData.total_marks}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Pass Marks *</label>
              <input
                type="number"
                step="0.5"
                name="pass_marks"
                min="0"
                required
                className="form-control"
                value={formData.pass_marks}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Exam Window Starts *</label>
              <input
                type="datetime-local"
                name="start_window"
                required
                className="form-control"
                value={formData.start_window}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Exam Window Closes *</label>
              <input
                type="datetime-local"
                name="end_window"
                required
                className="form-control"
                value={formData.end_window}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', margin: '16px 0 24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gray-900)' }}>
              Integrity & Retake Policy Settings
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Maximum Attempts Allowed *</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  name="max_attempts"
                  className="form-control"
                  value={formData.max_attempts}
                  onChange={handleChange}
                />
              </div>
              <label className="form-check" style={{ marginTop: '22px' }}>
                <input
                  type="checkbox"
                  name="allow_retake"
                  checked={formData.allow_retake}
                  onChange={handleChange}
                />
                <span><strong>Allow Exam Retakes:</strong> Permit multiple attempts up to the maximum limit</span>
              </label>
            </div>
            <label className="form-check">
              <input
                type="checkbox"
                name="enable_proctoring"
                checked={formData.enable_proctoring}
                onChange={handleChange}
              />
              <span><strong>Enable Proctoring Signals:</strong> Request webcam permission, face counting, and log tab/fullscreen exits</span>
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                name="shuffle_questions"
                checked={formData.shuffle_questions}
                onChange={handleChange}
              />
              <span><strong>Shuffle Questions:</strong> Randomize question order uniquely per student</span>
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                name="shuffle_options"
                checked={formData.shuffle_options}
                onChange={handleChange}
              />
              <span><strong>Shuffle MCQ Options:</strong> Randomize option order per question</span>
            </label>
            <label className="form-check">
              <input
                type="checkbox"
                name="is_published"
                checked={formData.is_published}
                onChange={handleChange}
              />
              <span><strong>Publish Immediately:</strong> Make exam visible and open to assigned students</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link to="/faculty" className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={saving} className="btn btn-primary btn-lg">
              {saving ? 'Saving...' : isEditing ? 'Update Exam' : 'Save & Add Questions ➜'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
