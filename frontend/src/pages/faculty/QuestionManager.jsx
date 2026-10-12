import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';

export const QuestionManager = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteQId, setDeleteQId] = useState(null);

  // New Question Form State
  const [newQType, setNewQType] = useState('MCQ');
  const [newQText, setNewQText] = useState('');
  const [newQMarks, setNewQMarks] = useState(2.0);
  const [newQNegMarks, setNewQNegMarks] = useState(0.0);
  const [options, setOptions] = useState([
    { option_text: '', is_correct: true, order: 1 },
    { option_text: '', is_correct: false, order: 2 },
    { option_text: '', is_correct: false, order: 3 },
    { option_text: '', is_correct: false, order: 4 },
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [examRes, qRes] = await Promise.all([
        facultyAPI.getExam(examId),
        facultyAPI.getQuestions(examId),
      ]);
      setExam(examRes.data);
      setQuestions(qRes.data);
    } catch {
      alert('Failed to load questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [examId]);

  const handleOptionChange = (idx, text) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[idx].option_text = text;
      return copy;
    });
  };

  const handleSetCorrectOption = (idx) => {
    setOptions((prev) =>
      prev.map((opt, i) => ({
        ...opt,
        is_correct: i === idx,
      }))
    );
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!newQText.trim()) return;

    const payload = {
      exam: parseInt(examId, 10),
      question_text: newQText,
      question_type: newQType,
      marks: newQMarks,
      negative_marks: newQNegMarks,
      order: questions.length + 1,
    };

    if (newQType === 'MCQ') {
      const validOptions = options.filter((o) => o.option_text.trim() !== '');
      if (validOptions.length < 2) {
        alert('Please provide at least 2 valid options for an MCQ.');
        return;
      }
      if (!validOptions.some((o) => o.is_correct)) {
        alert('Please designate one option as the correct answer.');
        return;
      }
      payload.options = validOptions;
    }

    try {
      await facultyAPI.createQuestion(examId, payload);
      setShowAddModal(false);
      setNewQText('');
      setOptions([
        { option_text: '', is_correct: true, order: 1 },
        { option_text: '', is_correct: false, order: 2 },
        { option_text: '', is_correct: false, order: 3 },
        { option_text: '', is_correct: false, order: 4 },
      ]);
      loadData();
    } catch (err) {
      const errorData = err.response?.data;
      let msg = 'Failed to create question.';
      if (errorData && typeof errorData === 'object') {
        msg = Object.entries(errorData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\n');
      } else if (typeof errorData === 'string') {
        msg = errorData;
      }
      alert(`Error creating question:\n${msg}`);
    }
  };


  const handleDeleteQuestion = async () => {
    if (!deleteQId) return;
    try {
      await facultyAPI.deleteQuestion(deleteQId);
      setDeleteQId(null);
      loadData();
    } catch {
      alert('Failed to delete question.');
    }
  };

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
            Question Bank: {exam?.title || 'Exam'}
          </h1>
          <p className="page-subtitle">
            {questions.length} Questions configured • Total configured marks: {questions.reduce((sum, q) => sum + parseFloat(q.marks || 0), 0)}
          </p>
        </div>

        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          + Add Question
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>Loading questions...</div>
      ) : questions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--gray-500)' }}>
          <p style={{ fontSize: '16px', fontWeight: '600' }}>No questions created for this exam yet.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>Click "+ Add Question" above to start populating MCQs and descriptive questions.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q, idx) => (
            <div key={q.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="badge badge-neutral" style={{ marginRight: '8px' }}>
                    Q{idx + 1} • {q.question_type}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>
                    +{q.marks} Marks {q.negative_marks > 0 && `(-${q.negative_marks} neg)`}
                  </span>
                </div>
                <button
                  onClick={() => setDeleteQId(q.id)}
                  className="btn btn-outline-danger btn-sm"
                >
                  Delete
                </button>
              </div>

              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-900)', margin: '12px 0' }}>
                {q.question_text}
              </div>

              {q.question_type === 'MCQ' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                  {(q.options || []).map((opt) => (
                    <div
                      key={opt.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: opt.is_correct ? '2px solid var(--success)' : '1px solid var(--gray-200)',
                        background: opt.is_correct ? 'var(--success-bg)' : 'var(--gray-50)',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{opt.option_text}</span>
                      {opt.is_correct && (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--success)' }}>
                          ✓ CORRECT
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Question Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '16px' }}>Add Question</h2>
            <form onSubmit={handleAddQuestion}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Type</label>
                  <select
                    className="form-control"
                    value={newQType}
                    onChange={(e) => setNewQType(e.target.value)}
                  >
                    <option value="MCQ">MCQ (Auto-Graded)</option>
                    <option value="DESCRIPTIVE">Descriptive / Essay</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Marks</label>
                  <input
                    type="number"
                    step="0.5"
                    className="form-control"
                    value={newQMarks}
                    onChange={(e) => setNewQMarks(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Negative Marks</label>
                  <input
                    type="number"
                    step="0.25"
                    className="form-control"
                    value={newQNegMarks}
                    onChange={(e) => setNewQNegMarks(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Question Text *</label>
                <textarea
                  required
                  className="form-control"
                  style={{ minHeight: '80px' }}
                  value={newQText}
                  onChange={(e) => setNewQText(e.target.value)}
                  placeholder="Enter the problem statement or question..."
                />
              </div>

              {newQType === 'MCQ' && (
                <div>
                  <label className="form-label">Options (Select the correct answer button):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="radio"
                          name="correct_option"
                          checked={opt.is_correct}
                          onChange={() => handleSetCorrectOption(i)}
                          title="Mark this as the correct answer"
                          style={{ width: '20px', height: '20px', accentColor: 'var(--success)' }}
                        />
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Option ${i + 1}`}
                          value={opt.option_text}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                        />
                        <span style={{ fontSize: '11px', width: '70px', color: opt.is_correct ? 'var(--success)' : 'var(--gray-400)', fontWeight: opt.is_correct ? '700' : 'normal' }}>
                          {opt.is_correct ? 'CORRECT' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteQId}
        title="Delete Question"
        message="Are you sure you want to delete this question? Any existing student answers linked to it will also be deleted."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteQuestion}
        onCancel={() => setDeleteQId(null)}
      />
    </div>
  );
};
