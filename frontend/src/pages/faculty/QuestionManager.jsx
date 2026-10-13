import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';
import { ConfirmModal } from '../../components/ConfirmModal';

const QUESTION_TYPES = [
  { value: 'MCQ', label: '1. Multiple Choice (Single Answer)', desc: 'Student selects exactly one option.' },
  { value: 'MULTIPLE_SELECT', label: '2. Multiple Select (Multiple Answers)', desc: 'Student can select more than one option.' },
  { value: 'TRUE_FALSE', label: '3. True or False', desc: 'Student selects True or False.' },
  { value: 'SHORT_ANSWER', label: '4. Short Answer', desc: 'Student enters a short text response.' },
  { value: 'DESCRIPTIVE', label: '5. Long Answer / Descriptive', desc: 'Student writes a detailed response.' },
  { value: 'FILL_IN_BLANKS', label: '6. Fill in the Blanks', desc: 'Student enters the missing word or words.' },
  { value: 'MATCHING', label: '7. Matching', desc: 'Student matches items from two columns.' },
  { value: 'NUMERICAL', label: '8. Numerical Answer', desc: 'Student enters a numeric answer with optional tolerance.' },
  { value: 'IMAGE_BASED', label: '9. Image-Based Question', desc: 'Question with an attached image and prompt.' },
  { value: 'CODE', label: '10. Code-Based Question', desc: 'Student enters code in a text editor (not executed).' },
];

export const QuestionManager = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteQId, setDeleteQId] = useState(null);

  // Common Question Form State
  const [newQType, setNewQType] = useState('MCQ');
  const [newQText, setNewQText] = useState('');
  const [newQMarks, setNewQMarks] = useState(2.0);
  const [newQNegMarks, setNewQNegMarks] = useState(0.0);
  const [manualGrading, setManualGrading] = useState(false);

  // MCQ & Multiple Select Options State
  const [options, setOptions] = useState([
    { option_text: '', is_correct: true, order: 1 },
    { option_text: '', is_correct: false, order: 2 },
    { option_text: '', is_correct: false, order: 3 },
    { option_text: '', is_correct: false, order: 4 },
  ]);

  // True/False State
  const [tfCorrect, setTfCorrect] = useState('True');

  // Short Answer State
  const [acceptedAnswersText, setAcceptedAnswersText] = useState('');

  // Numerical State
  const [numericalValue, setNumericalValue] = useState('');
  const [numericalTolerance, setNumericalTolerance] = useState('0.0');

  // Fill in the Blanks State
  const [blanksList, setBlanksList] = useState(['']);

  // Matching State
  const [matchingPairs, setMatchingPairs] = useState([
    { left: '', right: '' },
    { left: '', right: '' },
  ]);

  // Image-Based State
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);

  // Code-Based State
  const [codeLanguage, setCodeLanguage] = useState('python');
  const [starterCode, setStarterCode] = useState('');

  const loadData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
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
    loadData(false);
  }, [examId]);

  const handleTypeChange = (newType) => {
    setNewQType(newType);
    if (newType === 'DESCRIPTIVE' || newType === 'CODE') {
      setManualGrading(true);
    } else {
      setManualGrading(false);
    }
  };

  const resetForm = () => {
    setNewQType('MCQ');
    setNewQText('');
    setNewQMarks(2.0);
    setNewQNegMarks(0.0);
    setManualGrading(false);
    setOptions([
      { option_text: '', is_correct: true, order: 1 },
      { option_text: '', is_correct: false, order: 2 },
      { option_text: '', is_correct: false, order: 3 },
      { option_text: '', is_correct: false, order: 4 },
    ]);
    setTfCorrect('True');
    setAcceptedAnswersText('');
    setNumericalValue('');
    setNumericalTolerance('0.0');
    setBlanksList(['']);
    setMatchingPairs([
      { left: '', right: '' },
      { left: '', right: '' },
    ]);
    setImageUrl('');
    setImageFile(null);
    setCodeLanguage('python');
    setStarterCode('');
  };

  // Option Handlers for MCQ / Multiple Select
  const handleOptionChange = (idx, text) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[idx].option_text = text;
      return copy;
    });
  };

  const handleSetSingleCorrectOption = (idx) => {
    setOptions((prev) =>
      prev.map((opt, i) => ({
        ...opt,
        is_correct: i === idx,
      }))
    );
  };

  const handleToggleMultipleCorrectOption = (idx) => {
    setOptions((prev) => {
      const copy = [...prev];
      copy[idx].is_correct = !copy[idx].is_correct;
      return copy;
    });
  };

  const handleAddOption = () => {
    setOptions((prev) => [
      ...prev,
      { option_text: '', is_correct: false, order: prev.length + 1 },
    ]);
  };

  const handleRemoveOption = (idx) => {
    if (options.length <= 2) {
      alert('A minimum of 2 options is required.');
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  // Matching Handlers
  const handleMatchingChange = (idx, field, val) => {
    setMatchingPairs((prev) => {
      const copy = [...prev];
      copy[idx][field] = val;
      return copy;
    });
  };

  const handleAddMatchingPair = () => {
    setMatchingPairs((prev) => [...prev, { left: '', right: '' }]);
  };

  const handleRemoveMatchingPair = (idx) => {
    if (matchingPairs.length <= 2) {
      alert('A minimum of 2 pairs is required.');
      return;
    }
    setMatchingPairs((prev) => prev.filter((_, i) => i !== idx));
  };

  // Blanks Handlers
  const handleBlankChange = (idx, val) => {
    setBlanksList((prev) => {
      const copy = [...prev];
      copy[idx] = val;
      return copy;
    });
  };

  const handleAddBlank = () => {
    setBlanksList((prev) => [...prev, '']);
  };

  const handleRemoveBlank = (idx) => {
    if (blanksList.length <= 1) return;
    setBlanksList((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submission
  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!newQText.trim()) {
      alert('Please enter the question text.');
      return;
    }

    const payload = {
      exam: parseInt(examId, 10),
      question_text: newQText,
      question_type: newQType,
      marks: newQMarks,
      negative_marks: newQNegMarks,
      manual_grading: manualGrading,
      order: questions.length + 1,
      correct_answer_data: {},
      question_metadata: {},
    };

    if (newQType === 'MCQ' || (newQType === 'IMAGE_BASED' && options.some((o) => o.option_text.trim()))) {
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
    } else if (newQType === 'MULTIPLE_SELECT') {
      const validOptions = options.filter((o) => o.option_text.trim() !== '');
      if (validOptions.length < 2) {
        alert('Please provide at least 2 valid options for Multiple Select.');
        return;
      }
      if (!validOptions.some((o) => o.is_correct)) {
        alert('Please select at least one correct option.');
        return;
      }
      payload.options = validOptions;
    } else if (newQType === 'TRUE_FALSE') {
      payload.options = [
        { option_text: 'True', is_correct: tfCorrect === 'True', order: 1 },
        { option_text: 'False', is_correct: tfCorrect === 'False', order: 2 },
      ];
    } else if (newQType === 'SHORT_ANSWER') {
      if (!manualGrading) {
        const answers = acceptedAnswersText
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);
        if (answers.length === 0) {
          alert('Please enter at least one accepted answer for automatic grading, or toggle manual grading.');
          return;
        }
        payload.correct_answer_data = { accepted_answers: answers };
      }
    } else if (newQType === 'NUMERICAL') {
      if (numericalValue.trim() === '') {
        alert('Please enter the target numerical answer value.');
        return;
      }
      payload.correct_answer_data = {
        value: parseFloat(numericalValue) || 0,
        tolerance: parseFloat(numericalTolerance) || 0.0,
      };
    } else if (newQType === 'FILL_IN_BLANKS') {
      const blanks = blanksList.map((b) =>
        b
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      );
      if (blanks.length === 0 || blanks.some((b) => b.length === 0)) {
        alert('Please provide accepted answer(s) for each blank.');
        return;
      }
      payload.correct_answer_data = { blanks };
      payload.question_metadata = { blanks_count: blanks.length };
    } else if (newQType === 'MATCHING') {
      const validPairs = matchingPairs.filter((p) => p.left.trim() && p.right.trim());
      if (validPairs.length < 2) {
        alert('Please provide at least 2 matching pairs.');
        return;
      }
      payload.correct_answer_data = { pairs: validPairs };
      payload.question_metadata = {
        left_items: validPairs.map((p) => p.left),
        right_items: validPairs.map((p) => p.right),
      };
    } else if (newQType === 'CODE') {
      payload.question_metadata = {
        language: codeLanguage,
        starter_code: starterCode,
      };
    }

    if (imageUrl.trim()) {
      payload.image_url = imageUrl.trim();
    }

    try {
      if (imageFile) {
        const formData = new FormData();
        Object.keys(payload).forEach((k) => {
          if (typeof payload[k] === 'object') {
            formData.append(k, JSON.stringify(payload[k]));
          } else {
            formData.append(k, payload[k]);
          }
        });
        formData.append('image', imageFile);
        await facultyAPI.createQuestion(examId, formData);
      } else {
        await facultyAPI.createQuestion(examId, payload);
      }

      setShowAddModal(false);
      resetForm();
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

  const getTypeBadgeColor = (type) => {
    switch (type) {
      case 'MCQ': return '#2563eb';
      case 'MULTIPLE_SELECT': return '#7c3aed';
      case 'TRUE_FALSE': return '#059669';
      case 'SHORT_ANSWER': return '#d97706';
      case 'DESCRIPTIVE': return '#4b5563';
      case 'FILL_IN_BLANKS': return '#0891b2';
      case 'MATCHING': return '#9333ea';
      case 'NUMERICAL': return '#ea580c';
      case 'IMAGE_BASED': return '#0284c7';
      case 'CODE': return '#16a34a';
      default: return '#6b7280';
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
            {questions.length} Questions configured • Total marks: {questions.reduce((sum, q) => sum + parseFloat(q.marks || 0), 0)} • Navigation: {exam?.navigation_mode === 'FORWARD_ONLY' ? 'Forward Only' : 'Forward & Backward'}
          </p>
        </div>

        <button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn btn-primary">
          + Add Question
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>Loading questions...</div>
      ) : questions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--gray-500)' }}>
          <p style={{ fontSize: '16px', fontWeight: '600' }}>No questions created for this exam yet.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>Click "+ Add Question" above to start populating all 10 question types.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q, idx) => (
            <div key={q.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: '#ffffff',
                      background: getTypeBadgeColor(q.question_type),
                      padding: '3px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Q{idx + 1} • {q.question_type}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--primary)' }}>
                    +{q.marks} Marks {parseFloat(q.negative_marks) > 0 && `(-${q.negative_marks} neg)`}
                  </span>
                  {q.manual_grading && (
                    <span className="badge badge-warning" style={{ fontSize: '10px' }}>
                      Manual Faculty Review
                    </span>
                  )}
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

              {/* Render Question Preview Details */}
              {q.image_url && (
                <div style={{ marginBottom: '12px' }}>
                  <img src={q.image_url} alt="Question Asset" style={{ maxHeight: '180px', borderRadius: '6px', border: '1px solid var(--gray-200)' }} />
                </div>
              )}

              {/* MCQ & Multiple Select & True/False choices */}
              {(q.question_type === 'MCQ' || q.question_type === 'MULTIPLE_SELECT' || q.question_type === 'TRUE_FALSE' || (q.question_type === 'IMAGE_BASED' && q.options?.length > 0)) && (
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

              {/* Numerical Details */}
              {q.question_type === 'NUMERICAL' && q.correct_answer_data && (
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', color: '#1e293b' }}>
                  Target Value: <strong>{q.correct_answer_data.value}</strong> • Tolerance: <strong>±{q.correct_answer_data.tolerance || 0}</strong>
                </div>
              )}

              {/* Fill in the Blanks Details */}
              {q.question_type === 'FILL_IN_BLANKS' && q.correct_answer_data?.blanks && (
                <div style={{ background: '#f0fdfa', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', color: '#134e4a' }}>
                  <strong>Accepted Blanks:</strong>{' '}
                  {q.correct_answer_data.blanks.map((b, bIdx) => (
                    <span key={bIdx} style={{ marginRight: '12px' }}>
                      [Blank {bIdx + 1}: <em>{Array.isArray(b) ? b.join(' / ') : b}</em>]
                    </span>
                  ))}
                </div>
              )}

              {/* Matching Pairs Details */}
              {q.question_type === 'MATCHING' && q.correct_answer_data?.pairs && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px', marginTop: '6px' }}>
                  {q.correct_answer_data.pairs.map((pair, pIdx) => (
                    <div key={pIdx} style={{ padding: '8px 12px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '6px', fontSize: '13px' }}>
                      <strong>{pair.left}</strong> ➔ <span style={{ color: '#7e22ce' }}>{pair.right}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Short Answer Details */}
              {q.question_type === 'SHORT_ANSWER' && q.correct_answer_data?.accepted_answers && (
                <div style={{ background: '#fefce8', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', color: '#854d0e' }}>
                  Accepted Answers: <strong>{q.correct_answer_data.accepted_answers.join(', ')}</strong>
                </div>
              )}

              {/* Code Details */}
              {q.question_type === 'CODE' && (
                <div style={{ background: '#f1f5f9', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: '#334155', fontFamily: 'monospace' }}>
                  Language: <strong>{q.question_metadata?.language || 'python'}</strong> • Manual instructor review required
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Question Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Add New Question</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleAddQuestion}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Question Type *</label>
                  <select
                    className="form-control"
                    value={newQType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Marks (+)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="form-control"
                    value={newQMarks}
                    onChange={(e) => setNewQMarks(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Negative Marks (-)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    className="form-control"
                    value={newQNegMarks}
                    onChange={(e) => setNewQNegMarks(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Question Text / Problem Statement *</label>
                <textarea
                  required
                  className="form-control"
                  style={{ minHeight: '80px' }}
                  value={newQText}
                  onChange={(e) => setNewQText(e.target.value)}
                  placeholder="Enter the question or problem statement..."
                />
              </div>

              {/* Dynamic Controls Based on Selected Question Type */}

              {/* 1. Multiple Choice (Single Answer) */}
              {newQType === 'MCQ' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Options (Select the single correct answer radio):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="radio"
                          name="single_correct_option"
                          checked={opt.is_correct}
                          onChange={() => handleSetSingleCorrectOption(i)}
                          title="Mark as correct answer"
                          style={{ width: '20px', height: '20px', accentColor: 'var(--success)' }}
                        />
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Option ${i + 1}`}
                          value={opt.option_text}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                        />
                        <button type="button" onClick={() => handleRemoveOption(i)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddOption} className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }}>
                    + Add Option
                  </button>
                </div>
              )}

              {/* 2. Multiple Select (Multiple Answers) */}
              {newQType === 'MULTIPLE_SELECT' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Options (Check all valid correct choices):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={opt.is_correct}
                          onChange={() => handleToggleMultipleCorrectOption(i)}
                          title="Check if correct"
                          style={{ width: '20px', height: '20px', accentColor: 'var(--success)' }}
                        />
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Option ${i + 1}`}
                          value={opt.option_text}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                        />
                        <button type="button" onClick={() => handleRemoveOption(i)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddOption} className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }}>
                    + Add Option
                  </button>
                </div>
              )}

              {/* 3. True or False */}
              {newQType === 'TRUE_FALSE' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Correct Statement Value:</label>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <label className="form-check">
                      <input
                        type="radio"
                        name="tf_value"
                        value="True"
                        checked={tfCorrect === 'True'}
                        onChange={(e) => setTfCorrect(e.target.value)}
                      />
                      <span><strong>True</strong> (Statement is True)</span>
                    </label>
                    <label className="form-check">
                      <input
                        type="radio"
                        name="tf_value"
                        value="False"
                        checked={tfCorrect === 'False'}
                        onChange={(e) => setTfCorrect(e.target.value)}
                      />
                      <span><strong>False</strong> (Statement is False)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 4. Short Answer */}
              {newQType === 'SHORT_ANSWER' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Accepted Correct Answers (comma-separated):</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Mitochondria, mitochondrion"
                    value={acceptedAnswersText}
                    onChange={(e) => setAcceptedAnswersText(e.target.value)}
                    disabled={manualGrading}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px', display: 'block' }}>
                    Evaluated case-insensitively. Or check "Require manual grading" below.
                  </span>
                </div>
              )}

              {/* 5. Fill in the Blanks */}
              {newQType === 'FILL_IN_BLANKS' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Blanks Keys (Enter accepted words for each blank, comma-separated for synonyms):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {blanksList.map((blank, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', width: '70px' }}>Blank {i + 1}:</span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Accepted answer(s) for Blank ${i + 1} (e.g. photosynthesis, photo-synthesis)`}
                          value={blank}
                          onChange={(e) => handleBlankChange(i, e.target.value)}
                        />
                        {blanksList.length > 1 && (
                          <button type="button" onClick={() => handleRemoveBlank(i)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddBlank} className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }}>
                    + Add Another Blank
                  </button>
                </div>
              )}

              {/* 6. Matching */}
              {newQType === 'MATCHING' && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Matching Pairs (Column A ➔ Column B):</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {matchingPairs.map((pair, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Left Item ${i + 1} (e.g. France)`}
                          value={pair.left}
                          onChange={(e) => handleMatchingChange(i, 'left', e.target.value)}
                        />
                        <span>➔</span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Right Match ${i + 1} (e.g. Paris)`}
                          value={pair.right}
                          onChange={(e) => handleMatchingChange(i, 'right', e.target.value)}
                        />
                        {matchingPairs.length > 2 && (
                          <button type="button" onClick={() => handleRemoveMatchingPair(i)} style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddMatchingPair} className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }}>
                    + Add Matching Pair
                  </button>
                </div>
              )}

              {/* 7. Numerical Answer */}
              {newQType === 'NUMERICAL' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Correct Numerical Value *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      className="form-control"
                      placeholder="e.g. 9.81 or 42"
                      value={numericalValue}
                      onChange={(e) => setNumericalValue(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Tolerance (± delta range)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      placeholder="e.g. 0.05"
                      value={numericalTolerance}
                      onChange={(e) => setNumericalTolerance(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 8. Image-Based Question */}
              {newQType === 'IMAGE_BASED' && (
                <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <label className="form-label">Image Source:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Image URL (e.g. https://... or /media/...)"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>or upload image file:</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImageFile(e.target.files[0])}
                    />
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <label className="form-label">Options (Optional, if multiple choice):</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="radio"
                            name="img_opt"
                            checked={opt.is_correct}
                            onChange={() => handleSetSingleCorrectOption(i)}
                          />
                          <input
                            type="text"
                            className="form-control"
                            placeholder={`Option ${i + 1}`}
                            value={opt.option_text}
                            onChange={(e) => handleOptionChange(i, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 9. Code-Based Question */}
              {newQType === 'CODE' && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '8px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Language</label>
                      <select
                        className="form-control"
                        value={codeLanguage}
                        onChange={(e) => setCodeLanguage(e.target.value)}
                      >
                        <option value="python">Python</option>
                        <option value="javascript">JavaScript</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                        <option value="sql">SQL</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Starter Code / Function Signature Template (Optional):</label>
                    <textarea
                      className="form-control"
                      style={{ fontFamily: 'monospace', minHeight: '80px', fontSize: '13px' }}
                      value={starterCode}
                      onChange={(e) => setStarterCode(e.target.value)}
                      placeholder="# def solution():\n#     pass"
                    />
                  </div>
                </div>
              )}

              {/* Manual Grading Toggle */}
              <div style={{ margin: '14px 0' }}>
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={manualGrading}
                    onChange={(e) => setManualGrading(e.target.checked)}
                  />
                  <span>
                    <strong>Require Manual Instructor Grading:</strong> Mark this question for subjective faculty evaluation instead of automated scoring.
                  </span>
                </label>
              </div>

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
