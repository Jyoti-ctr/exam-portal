import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';

export const ExamForm = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const isEditing = !!examId;

  const [formData, setFormData] = useState(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const now = new Date();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return {
      title: '',
      description: '',
      duration_minutes: 60,
      total_marks: 50.0,
      pass_marks: 20.0,
      max_attempts: 1,
      allow_retake: false,
      start_window: toISO(now),
      end_window: toISO(in7Days),
      navigation_mode: 'FORWARD_BACKWARD',
      warning_threshold: 8,
      is_camera_mandatory: false,
      monitored_warning_categories: [
        'TAB_BLUR',
        'FULLSCREEN_EXIT',
        'CAMERA_DISCONNECTED',
        'MULTIPLE_FACES_DETECTED',
      ],
      shuffle_questions: false,
      shuffle_options: false,
      enable_proctoring: true,
      is_published: false,
    };
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
            navigation_mode: data.navigation_mode || 'FORWARD_BACKWARD',
            warning_threshold: data.warning_threshold ?? 8,
            is_camera_mandatory: !!data.is_camera_mandatory,
            monitored_warning_categories: data.monitored_warning_categories || [
              'TAB_BLUR',
              'FULLSCREEN_EXIT',
              'CAMERA_DISCONNECTED',
              'MULTIPLE_FACES_DETECTED',
            ],
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
    }
  }, [examId, isEditing]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCategoryToggle = (catKey) => {
    setFormData((prev) => {
      const current = prev.monitored_warning_categories || [];
      if (current.includes(catKey)) {
        return { ...prev, monitored_warning_categories: current.filter((c) => c !== catKey) };
      } else {
        return { ...prev, monitored_warning_categories: [...current, catKey] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (formData.is_published && !formData.navigation_mode) {
      setError('Please select a required Question Navigation setting before publishing.');
      setSaving(false);
      return;
    }

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
    <div className="page-container" style={{ maxWidth: '820px' }}>
      <div className="card" style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--gray-200)', paddingBottom: '16px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--gray-900)', margin: '0 0 4px 0' }}>
            {isEditing ? 'Edit Examination Settings' : 'Create New Examination'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            Configure schedules, duration limits, passing marks, navigation rules, and integrity settings.
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

          {/* Section: Question Navigation Setting (Required Policy) */}
          <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #cbd5e1', margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span className="badge badge-primary" style={{ marginBottom: '6px' }}>REQUIRED NAVIGATION POLICY</span>
              <h4 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--gray-900)', margin: '4px 0 2px 0' }}>
                Question Navigation Setting *
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--gray-600)', margin: 0 }}>
                Faculty must choose how students are permitted to navigate between questions.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  border: formData.navigation_mode === 'FORWARD_ONLY' ? '2px solid var(--primary)' : '1px solid var(--gray-300)',
                  background: formData.navigation_mode === 'FORWARD_ONLY' ? '#f0f9ff' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="navigation_mode"
                  value="FORWARD_ONLY"
                  checked={formData.navigation_mode === 'FORWARD_ONLY'}
                  onChange={handleChange}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--gray-900)' }}>Option A: Forward Only</strong>
                  <p style={{ fontSize: '12px', color: 'var(--gray-600)', margin: '2px 0 0 0' }}>
                    Students can move from the current question to the next question. Students <strong>cannot navigate to a previous question</strong>. Once a student moves forward, they cannot return to an earlier question. Answers are saved before advancing.
                  </p>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  border: formData.navigation_mode === 'FORWARD_BACKWARD' ? '2px solid var(--primary)' : '1px solid var(--gray-300)',
                  background: formData.navigation_mode === 'FORWARD_BACKWARD' ? '#f0f9ff' : '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="navigation_mode"
                  value="FORWARD_BACKWARD"
                  checked={formData.navigation_mode === 'FORWARD_BACKWARD'}
                  onChange={handleChange}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--gray-900)' }}>Option B: Forward and Backward</strong>
                  <p style={{ fontSize: '12px', color: 'var(--gray-600)', margin: '2px 0 0 0' }}>
                    Students can navigate to both previous and next questions. Students can revisit and change answers freely until the exam is submitted or expires. Shows Previous/Next buttons and the question palette navigator.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section: Warning Policy & Automatic Submission */}
          <div style={{ background: '#fffbeb', padding: '18px', borderRadius: '8px', border: '1px solid #fde68a', margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span className="badge badge-warning" style={{ marginBottom: '6px' }}>INTEGRITY VIOLATION POLICY</span>
              <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#92400e', margin: '4px 0 2px 0' }}>
                Warning Counter & Automatic Submission Settings
              </h4>
              <p style={{ fontSize: '12px', color: '#78350f', margin: 0 }}>
                Default policy: The student receives a warning for qualifying violations. At warning 8, a final warning is issued. If warning count exceeds 8 (Warning 9), the exam automatically finalizes and submits.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#92400e' }}>
                  Allowed Warnings Before Auto-Submit *
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  name="warning_threshold"
                  className="form-control"
                  value={formData.warning_threshold}
                  onChange={handleChange}
                />
                <span style={{ fontSize: '11px', color: '#b45309' }}>
                  Standard required default is 8 allowed warnings (Warning 9 auto-submits).
                </span>
              </div>

              <label className="form-check" style={{ marginTop: '16px' }}>
                <input
                  type="checkbox"
                  name="is_camera_mandatory"
                  checked={formData.is_camera_mandatory}
                  onChange={handleChange}
                />
                <span style={{ color: '#92400e' }}>
                  <strong>Mandatory Webcam Monitoring:</strong> Camera disconnection counts as a qualifying warning
                </span>
              </label>
            </div>

            <div>
              <label className="form-label" style={{ color: '#92400e', marginBottom: '8px' }}>
                Monitored Incident Categories:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
                <label className="form-check" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.monitored_warning_categories.includes('TAB_BLUR')}
                    onChange={() => handleCategoryToggle('TAB_BLUR')}
                  />
                  <span>Tab Switches & Window Focus Loss</span>
                </label>
                <label className="form-check" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.monitored_warning_categories.includes('FULLSCREEN_EXIT')}
                    onChange={() => handleCategoryToggle('FULLSCREEN_EXIT')}
                  />
                  <span>Exiting Fullscreen Mode</span>
                </label>
                <label className="form-check" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.monitored_warning_categories.includes('CAMERA_DISCONNECTED')}
                    onChange={() => handleCategoryToggle('CAMERA_DISCONNECTED')}
                  />
                  <span>Webcam Loss or Disconnection</span>
                </label>
                <label className="form-check" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.monitored_warning_categories.includes('MULTIPLE_FACES_DETECTED')}
                    onChange={() => handleCategoryToggle('MULTIPLE_FACES_DETECTED')}
                  />
                  <span>Multiple Faces in Camera Frame</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', margin: '16px 0 24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gray-900)' }}>
              Attempt & Delivery Settings
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
