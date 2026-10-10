import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../api/client';
import { Timer } from '../../components/Timer';
import { ProctoringBadge } from '../../components/ProctoringBadge';
import { ConfirmModal } from '../../components/ConfirmModal';

export const ExamRoom = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  // Attempt & Exam State
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Answers State: question_id -> { selected_option_id, text_response, is_marked_for_review }
  const [answers, setAnswers] = useState({});
  const [saveStatus, setSaveStatus] = useState('All changes saved');

  // UI Modals & Flags
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Initialize or resume attempt
  useEffect(() => {
    let isMounted = true;

    const startAttempt = async () => {
      try {
        const res = await studentAPI.startOrResumeAttempt(examId);
        if (!isMounted) return;

        const attemptData = res.data;
        setAttempt(attemptData);
        setQuestions(attemptData.questions || []);

        // Reconstruct saved answers map
        const initialMap = {};
        (attemptData.saved_answers || []).forEach((ans) => {
          initialMap[ans.question_id] = {
            selected_option_id: ans.selected_option_id,
            text_response: ans.text_response || '',
            is_marked_for_review: ans.is_marked_for_review || false,
          };
        });
        setAnswers(initialMap);

        // Request fullscreen on start
        try {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch {
          // Ignore fullscreen rejection if browser blocks auto-request
        }
      } catch (err) {
        if (!isMounted) return;
        const msg = err.response?.data?.error || 'Unable to access this examination session.';
        setError(msg);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    startAttempt();

    return () => {
      isMounted = false;
    };
  }, [examId]);

  // Periodic heartbeat sync (every 30 seconds)
  useEffect(() => {
    if (!attempt?.id || attempt.is_completed) return;

    const interval = setInterval(async () => {
      try {
        const res = await studentAPI.heartbeat(attempt.id);
        if (res.data.status === 'expired') {
          handleAutoSubmit();
        }
      } catch {
        // Heartbeat failure handled gracefully
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [attempt?.id, attempt?.is_completed]);

  // Autosave function
  const triggerAutosave = useCallback(async (qId, optionId, text, isMarked) => {
    if (!attempt?.id) return;
    setSaveStatus('Saving answer...');

    try {
      await studentAPI.autosaveAnswer(attempt.id, {
        question_id: qId,
        selected_option_id: optionId,
        text_response: text,
        is_marked_for_review: isMarked,
      });
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSaveStatus(`Saved at ${timeStr}`);
    } catch (err) {
      if (err.response?.data?.error?.includes('expired')) {
        handleAutoSubmit();
      } else {
        setSaveStatus('⚠️ Save error. Retrying...');
      }
    }
  }, [attempt?.id]);

  // Current Question Helpers
  const currentQ = questions[currentIndex] || null;
  const currentAnswer = currentQ ? answers[currentQ.id] || {} : {};

  const handleSelectOption = (optionId) => {
    if (!currentQ) return;
    const updated = {
      ...currentAnswer,
      selected_option_id: optionId,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, optionId, updated.text_response, updated.is_marked_for_review);
  };

  const handleTextChange = (e) => {
    if (!currentQ) return;
    const text = e.target.value;
    const updated = {
      ...currentAnswer,
      text_response: text,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
  };

  const handleTextBlur = () => {
    if (!currentQ) return;
    triggerAutosave(currentQ.id, currentAnswer.selected_option_id, currentAnswer.text_response, currentAnswer.is_marked_for_review);
  };

  const handleToggleReview = () => {
    if (!currentQ) return;
    const newMarked = !currentAnswer.is_marked_for_review;
    const updated = {
      ...currentAnswer,
      is_marked_for_review: newMarked,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, updated.selected_option_id, updated.text_response, newMarked);
  };

  const handleClearSelection = () => {
    if (!currentQ) return;
    const updated = {
      ...currentAnswer,
      selected_option_id: null,
      text_response: '',
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, null, '', updated.is_marked_for_review);
  };

  // Submit Logic
  const handleAutoSubmit = () => {
    handleFinalSubmit(true);
  };

  const handleFinalSubmit = async (isAuto = false) => {
    if (submitting || !attempt?.id) return;
    setSubmitting(true);

    try {
      await studentAPI.submitAttempt(attempt.id);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      navigate('/student/submitted', {
        state: {
          examTitle: attempt.exam_title,
          submittedAt: new Date().toLocaleTimeString(),
          isAuto,
        },
      });
    } catch (err) {
      alert('Error submitting exam. Please check your connection.');
      setSubmitting(false);
    }
  };

  // Summary counts for submission confirmation
  const totalQuestions = questions.length;
  const answeredCount = Object.values(answers).filter(
    (a) => a.selected_option_id || (a.text_response && a.text_response.trim())
  ).length;
  const markedCount = Object.values(answers).filter((a) => a.is_marked_for_review).length;
  const unansweredCount = totalQuestions - answeredCount;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: '600' }}>Preparing secure exam session...</div>
        <div style={{ color: 'var(--gray-500)', fontSize: '14px' }}>Loading questions and synchronizing timer</div>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="page-container" style={{ maxWidth: '600px', marginTop: '60px' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '12px' }}>Access Unavailable</h2>
          <p style={{ color: 'var(--gray-600)', marginBottom: '20px' }}>{error}</p>
          <button onClick={() => navigate('/student')} className="btn btn-primary">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--gray-50)' }}>
      {/* Top Header */}
      <header className="exam-room-header">
        <div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', letterSpacing: '0.5px' }}>
            ONLINE EXAMINATION
          </span>
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--gray-900)', margin: '2px 0 0 0' }}>
            {attempt.exam_title}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '13px', color: 'var(--gray-500)', fontStyle: 'italic' }}>
            {saveStatus}
          </span>

          <Timer
            initialSeconds={attempt.remaining_seconds}
            onExpire={handleAutoSubmit}
          />

          <button
            onClick={() => setShowSubmitModal(true)}
            className="btn btn-primary"
            style={{ fontWeight: '700' }}
          >
            Finish Exam
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="exam-room-container">
        {/* Left Column: Question Card & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {currentQ && (
            <div className="question-card">
              <div className="question-header">
                <div>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>
                    QUESTION {currentIndex + 1} OF {totalQuestions}
                  </span>
                  <span className="badge badge-neutral" style={{ marginLeft: '10px' }}>
                    {currentQ.question_type === 'MCQ' ? 'Multiple Choice' : 'Descriptive'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gray-900)' }}>
                    +{currentQ.marks} Marks
                  </span>
                  {currentQ.negative_marks > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--danger)', marginLeft: '8px' }}>
                      (-{currentQ.negative_marks} neg)
                    </span>
                  )}
                </div>
              </div>

              <div className="question-text">{currentQ.question_text}</div>

              {/* MCQ Options */}
              {currentQ.question_type === 'MCQ' ? (
                <div className="options-list">
                  {(currentQ.options || []).map((opt) => {
                    const isSelected = currentAnswer.selected_option_id === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleSelectOption(opt.id)}
                        className={`option-choice ${isSelected ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQ.id}`}
                          checked={isSelected}
                          onChange={() => handleSelectOption(opt.id)}
                          className="option-radio"
                        />
                        <span>{opt.option_text}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Descriptive Response */
                <div style={{ marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label className="form-label">Type your response below (autosaves on typing):</label>
                  <textarea
                    className="form-control"
                    style={{ flex: 1, minHeight: '220px', fontSize: '15px', lineHeight: '1.6' }}
                    value={currentAnswer.text_response || ''}
                    onChange={handleTextChange}
                    onBlur={handleTextBlur}
                    placeholder="Type your explanation here..."
                  />
                </div>
              )}

              {/* Bottom Card Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '16px', borderTop: '1px solid var(--gray-200)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`btn ${currentAnswer.is_marked_for_review ? 'btn-danger' : 'btn-secondary'}`}
                  >
                    {currentAnswer.is_marked_for_review ? '★ Unmark Review' : '☆ Mark for Review'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="btn btn-secondary"
                  >
                    Clear Choice
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                    className="btn btn-secondary"
                  >
                    ‹ Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentIndex === totalQuestions - 1}
                    onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, totalQuestions - 1))}
                    className="btn btn-primary"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Palette & Proctoring Audit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Question Palette */}
          <div className="palette-card">
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--gray-900)' }}>
              Question Palette
            </h3>
            <div className="palette-grid">
              {questions.map((q, idx) => {
                const ans = answers[q.id] || {};
                const hasAnswer = ans.selected_option_id || (ans.text_response && ans.text_response.trim());
                const isMarked = ans.is_marked_for_review;
                const isCurrent = idx === currentIndex;

                let stateClass = '';
                if (isMarked) stateClass = 'marked';
                else if (hasAnswer) stateClass = 'answered';

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`palette-btn ${stateClass} ${isCurrent ? 'current' : ''}`}
                    title={`Go to Question ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="palette-legend">
              <div className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--success)' }} />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--warning)' }} />
                <span>Marked for Review ({markedCount})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--gray-300)' }} />
                <span>Not Answered ({unansweredCount})</span>
              </div>
            </div>
          </div>

          {/* Transparent Webcam & Audit Tile */}
          <ProctoringBadge
            attemptId={attempt.id}
            enableProctoring={attempt.enable_proctoring}
            onFullscreenWarning={() => setShowFullscreenModal(true)}
          />
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      <ConfirmModal
        isOpen={showSubmitModal}
        title="Submit Examination"
        message="Are you sure you want to finalize and submit your exam? You cannot modify your answers once submitted."
        confirmText={submitting ? 'Submitting...' : 'Yes, Submit Now'}
        confirmVariant="success"
        onConfirm={() => handleFinalSubmit(false)}
        onCancel={() => setShowSubmitModal(false)}
      >
        <div style={{ background: 'var(--gray-50)', padding: '16px', borderRadius: '8px', border: '1px solid var(--gray-200)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>Total Questions: <strong>{totalQuestions}</strong></div>
          <div style={{ color: 'var(--success)' }}>Answered: <strong>{answeredCount}</strong></div>
          <div style={{ color: 'var(--warning)' }}>Marked for Review: <strong>{markedCount}</strong></div>
          <div style={{ color: 'var(--danger)' }}>Unanswered: <strong>{unansweredCount}</strong></div>
        </div>
      </ConfirmModal>

      {/* Fullscreen Warning Modal */}
      <ConfirmModal
        isOpen={showFullscreenModal}
        title="⚠️ Fullscreen Mode Exited"
        message="You have exited fullscreen mode. This event has been recorded in the exam audit log. Please resume fullscreen mode immediately to proceed."
        confirmText="Re-enter Fullscreen"
        confirmVariant="primary"
        onConfirm={() => {
          document.documentElement.requestFullscreen().catch(() => {});
          setShowFullscreenModal(false);
        }}
        onCancel={() => setShowFullscreenModal(false)}
      />
    </div>
  );
};
