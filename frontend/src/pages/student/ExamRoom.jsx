import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../api/client';
import { Timer } from '../../components/Timer';
import { ProctoringBadge } from '../../components/ProctoringBadge';
import { ConfirmModal } from '../../components/ConfirmModal';
import { stopAllCameraStreams } from '../../utils/cameraManager';

export const ExamRoom = () => {
  const { examId } = useParams();
  const navigate = useNavigate();

  // Attempt & Exam State
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Answers State: question_id -> { selected_option_id, text_response, answer_data, is_marked_for_review }
  const [answers, setAnswers] = useState({});
  const [saveStatus, setSaveStatus] = useState('All changes saved');

  // UI Modals, Warnings & Flags
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);
  const [activeWarning, setActiveWarning] = useState(null);
  const [warningsCount, setWarningsCount] = useState(0);
  const [isFinalWarning, setIsFinalWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);

  // Guarantee all hardware camera tracks are killed upon component unmount
  useEffect(() => {
    return () => {
      stopAllCameraStreams();
    };
  }, []);

  // Initialize or resume attempt
  useEffect(() => {
    let isMounted = true;

    const startAttempt = async () => {
      try {
        const res = await studentAPI.startOrResumeAttempt(examId);
        if (!isMounted) return;

        const attemptData = res.data;

        // If attempt is already completed or expired, redirect to submitted page
        if (attemptData.is_completed) {
          stopAllCameraStreams();
          navigate('/student/submitted', {
            state: {
              examTitle: attemptData.exam_title,
              submittedAt: attemptData.submitted_at || new Date().toLocaleTimeString(),
              isAuto: attemptData.status === 'AUTO_SUBMITTED' || attemptData.status === 'EXPIRED',
              reason: attemptData.submission_reason || '',
              warningCount: attemptData.warning_count || 0,
            },
          });
          return;
        }

        setAttempt(attemptData);
        setQuestions(attemptData.questions || []);
        setWarningsCount(attemptData.warning_count || 0);

        if (attemptData.warning_count >= (attemptData.max_warnings || 8)) {
          setIsFinalWarning(true);
        }

        // Forward-Only progression preservation: Resume at server's current_question_index
        if (attemptData.navigation_mode === 'FORWARD_ONLY' && typeof attemptData.current_question_index === 'number') {
          setCurrentIndex(attemptData.current_question_index);
        }

        // Reconstruct saved answers map
        const initialMap = {};
        (attemptData.saved_answers || []).forEach((ans) => {
          initialMap[ans.question_id] = {
            selected_option_id: ans.selected_option_id,
            text_response: ans.text_response || '',
            answer_data: ans.answer_data || {},
            is_marked_for_review: ans.is_marked_for_review || false,
          };
        });
        setAnswers(initialMap);

        // Request fullscreen on start if exam requires proctoring
        if (attemptData.enable_proctoring) {
          try {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen().catch(() => {});
            }
          } catch {
            // Ignore auto-request rejection if browser policies require user gesture
          }
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
  }, [examId, navigate]);

  // Window beforeunload guard to protect in-flight responses
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (attempt?.id && !attempt?.is_completed) {
        e.preventDefault();
        e.returnValue = 'You have an active exam attempt in progress. Leaving this page may record an integrity event.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [attempt?.id, attempt?.is_completed]);

  // Current Question Helpers
  const isForwardOnly = attempt?.navigation_mode === 'FORWARD_ONLY';
  const maxWarnings = attempt?.max_warnings || attempt?.warning_threshold || 8;
  const currentQ = questions[currentIndex] || null;
  const currentAnswer = useMemo(() => (currentQ ? answers[currentQ.id] || {} : {}), [currentQ, answers]);
  const isReadOnly = attempt?.is_completed || submitting;

  const handleFinalSubmitRef = useRef(null);

  // Autosave function (supports options, text, and answer_data)
  const triggerAutosave = useCallback(async (qId, optionId, text, ansData, isMarked) => {
    if (!attempt?.id || attempt.is_completed) return;
    setSaveStatus('Saving answer...');

    try {
      await studentAPI.autosaveAnswer(attempt.id, {
        question_id: qId,
        selected_option_id: optionId,
        text_response: text || '',
        answer_data: ansData || {},
        is_marked_for_review: isMarked || false,
      });
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSaveStatus(`Saved at ${timeStr}`);
    } catch (err) {
      if (err.response?.data?.error?.includes('expired') || err.response?.data?.error?.includes('submitted')) {
        handleFinalSubmitRef.current?.(true, 'time_expired');
      } else {
        setSaveStatus('⚠️ Connection glitch. Retrying...');
      }
    }
  }, [attempt]);

  // Submit Logic
  const handleFinalSubmit = useCallback(async (isAuto = false, reason = 'manual') => {
    if (submitting || !attempt?.id) return;
    setSubmitting(true);
    setSubmissionError(null);

    // Save final state of active question before submit
    if (currentQ) {
      await triggerAutosave(
        currentQ.id,
        currentAnswer.selected_option_id,
        currentAnswer.text_response,
        currentAnswer.answer_data,
        currentAnswer.is_marked_for_review
      );
    }

    try {
      await studentAPI.submitAttempt(attempt.id);
      stopAllCameraStreams();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      navigate('/student/submitted', {
        state: {
          examTitle: attempt.exam_title,
          submittedAt: new Date().toLocaleTimeString(),
          isAuto,
          reason,
          warningCount: warningsCount,
        },
      });
    } catch (err) {
      if (err.response?.data?.status === 'already_submitted') {
        stopAllCameraStreams();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        navigate('/student/submitted', {
          state: {
            examTitle: attempt.exam_title,
            submittedAt: new Date().toLocaleTimeString(),
            isAuto,
            reason: err.response?.data?.submission_reason || reason,
            warningCount: warningsCount,
          },
        });
      } else {
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Network issue during final submission. Your answers are saved on the server. Please click "Retry Submission".';
        setSubmissionError(msg);
        setSubmitting(false);
      }
    }
  }, [submitting, attempt, currentQ, currentAnswer, triggerAutosave, warningsCount, navigate]);

  useEffect(() => {
    handleFinalSubmitRef.current = handleFinalSubmit;
  }, [handleFinalSubmit]);

  const handleAutoSubmit = useCallback((reason = 'time_expired') => {
    handleFinalSubmit(true, reason);
  }, [handleFinalSubmit]);

  // Authoritative Warning handler (Tab blur, fullscreen exit, multiple faces, camera drop)
  const lastEventLoggedTimeRef = useRef({});

  const handleProctoringWarning = useCallback(async (warning) => {
    if (!attempt?.id || attempt.is_completed || submitting) return;

    // Client-side debounce (3.5s per violation type) to prevent notification flooding
    const now = Date.now();
    const lastTime = lastEventLoggedTimeRef.current[warning.type] || 0;
    if (now - lastTime < 3500) {
      return;
    }
    lastEventLoggedTimeRef.current[warning.type] = now;

    try {
      const res = await studentAPI.logProctoringEvent({
        attempt_id: attempt.id,
        event_type: warning.type,
        details: { message: warning.message, timestamp: new Date().toISOString() },
      });

      const data = res.data;
      if (data.warning_count !== undefined) {
        setWarningsCount(data.warning_count);
      }

      // Check if automatic submission was triggered on server (Warning > 8)
      if (data.auto_submitted) {
        stopAllCameraStreams();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        navigate('/student/submitted', {
          state: {
            examTitle: attempt.exam_title,
            submittedAt: new Date().toLocaleTimeString(),
            isAuto: true,
            reason: data.submission_reason || 'warning_threshold_exceeded',
            warningCount: data.warning_count || 9,
          },
        });
        return;
      }

      if (data.is_final_warning) {
        setIsFinalWarning(true);
      }

      setActiveWarning({
        message: data.message || warning.message,
        isFinal: !!data.is_final_warning,
      });

      // Auto-dismiss standard banner after 8 seconds (keep final warning persistent)
      if (!data.is_final_warning) {
        setTimeout(() => {
          setActiveWarning((curr) => (curr?.message === data.message ? null : curr));
        }, 8000);
      }
    } catch (err) {
      // In case server finalized attempt during request
      if (err.response?.data?.is_completed) {
        stopAllCameraStreams();
        navigate('/student/submitted', {
          state: {
            examTitle: attempt.exam_title,
            submittedAt: new Date().toLocaleTimeString(),
            isAuto: true,
            reason: err.response?.data?.submission_reason || 'warning_threshold_exceeded',
            warningCount: err.response?.data?.warning_count || 9,
          },
        });
      }
    }
  }, [attempt, submitting, navigate]);

  // Direct Tab Visibility and Window Blur/Focus Proctoring Listeners
  useEffect(() => {
    if (!attempt?.enable_proctoring || attempt?.is_completed || submitting) return;

    const handleVisibility = () => {
      if (document.hidden) {
        handleProctoringWarning({
          type: 'TAB_BLUR',
          message: 'You switched tabs or minimized the exam window. Tab switches are logged for instructor audit.',
        });
      } else {
        studentAPI.logProctoringEvent({
          attempt_id: attempt.id,
          event_type: 'TAB_FOCUS',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    const handleBlur = () => {
      handleProctoringWarning({
        type: 'TAB_BLUR',
        message: 'You navigated away from the exam tab. Tab switches are logged for instructor audit.',
      });
    };

    const handleFocus = () => {
      studentAPI.logProctoringEvent({
        attempt_id: attempt.id,
        event_type: 'TAB_FOCUS',
        details: { signal: 'window_focus', timestamp: new Date().toISOString() },
      }).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [attempt?.id, attempt?.enable_proctoring, attempt?.is_completed, submitting, handleProctoringWarning]);

  // Periodic heartbeat sync (every 25 seconds) to enforce server-authoritative timer
  useEffect(() => {
    if (!attempt?.id || attempt.is_completed) return;

    const interval = setInterval(async () => {
      try {
        const res = await studentAPI.heartbeat(attempt.id);
        if (res.data.status === 'expired') {
          handleAutoSubmit('time_expired');
        }
      } catch {
        // Heartbeat failure handled gracefully
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [attempt?.id, attempt?.is_completed, handleAutoSubmit]);

  const handleFullscreenWarning = useCallback(() => {
    setShowFullscreenModal(true);
  }, []);

  // Answer modification handlers
  const handleSelectOption = (optionId) => {
    if (!currentQ || isReadOnly) return;
    const updated = {
      ...currentAnswer,
      selected_option_id: optionId,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, optionId, updated.text_response, updated.answer_data, updated.is_marked_for_review);
  };

  const handleToggleMultipleOption = (optionId) => {
    if (!currentQ || isReadOnly) return;
    const currentSelected = currentAnswer.answer_data?.selected_option_ids || [];
    let updatedSelected;
    if (currentSelected.includes(optionId)) {
      updatedSelected = currentSelected.filter((id) => id !== optionId);
    } else {
      updatedSelected = [...currentSelected, optionId];
    }
    const updated = {
      ...currentAnswer,
      selected_option_id: updatedSelected[0] || null,
      answer_data: { ...(currentAnswer.answer_data || {}), selected_option_ids: updatedSelected },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, updated.selected_option_id, updated.text_response, updated.answer_data, updated.is_marked_for_review);
  };

  const handleTrueFalseSelect = (val) => {
    if (!currentQ || isReadOnly) return;
    const targetOption = (currentQ.options || []).find(
      (opt) => opt.option_text.trim().toLowerCase() === val.toLowerCase()
    );
    const updated = {
      ...currentAnswer,
      selected_option_id: targetOption ? targetOption.id : null,
      answer_data: { ...(currentAnswer.answer_data || {}), boolean_answer: val === 'True' },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, updated.selected_option_id, updated.text_response, updated.answer_data, updated.is_marked_for_review);
  };

  const handleTextChange = (e) => {
    if (!currentQ || isReadOnly) return;
    const text = e.target.value;
    const updated = {
      ...currentAnswer,
      text_response: text,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
  };

  const handleTextBlur = () => {
    if (!currentQ || isReadOnly) return;
    triggerAutosave(
      currentQ.id,
      currentAnswer.selected_option_id,
      currentAnswer.text_response,
      currentAnswer.answer_data,
      currentAnswer.is_marked_for_review
    );
  };

  const handleNumericalChange = (e) => {
    if (!currentQ || isReadOnly) return;
    const val = e.target.value;
    const updated = {
      ...currentAnswer,
      text_response: val,
      answer_data: { ...(currentAnswer.answer_data || {}), numerical_value: val },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
  };

  const handleBlankChange = (blankIdx, textVal) => {
    if (!currentQ || isReadOnly) return;
    const currentBlanks = [...(currentAnswer.answer_data?.blank_answers || [])];
    currentBlanks[blankIdx] = textVal;
    const updated = {
      ...currentAnswer,
      text_response: currentBlanks.join(', '),
      answer_data: { ...(currentAnswer.answer_data || {}), blank_answers: currentBlanks },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
  };

  const handleMatchingSelect = (leftItem, selectedRight) => {
    if (!currentQ || isReadOnly) return;
    const currentPairs = { ...(currentAnswer.answer_data?.pairs || {}) };
    currentPairs[leftItem] = selectedRight;
    const updated = {
      ...currentAnswer,
      answer_data: { ...(currentAnswer.answer_data || {}), pairs: currentPairs },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(
      currentQ.id,
      currentAnswer.selected_option_id,
      currentAnswer.text_response,
      updated.answer_data,
      updated.is_marked_for_review
    );
  };

  const handleCodeChange = (e) => {
    if (!currentQ || isReadOnly) return;
    const code = e.target.value;
    const updated = {
      ...currentAnswer,
      text_response: code,
      answer_data: { ...(currentAnswer.answer_data || {}), code },
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
  };

  const handleToggleReview = () => {
    if (!currentQ || isReadOnly) return;
    const newMarked = !currentAnswer.is_marked_for_review;
    const updated = {
      ...currentAnswer,
      is_marked_for_review: newMarked,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(
      currentQ.id,
      updated.selected_option_id,
      updated.text_response,
      updated.answer_data,
      newMarked
    );
  };

  const handleClearSelection = () => {
    if (!currentQ || isReadOnly) return;
    const updated = {
      selected_option_id: null,
      text_response: '',
      answer_data: {},
      is_marked_for_review: currentAnswer.is_marked_for_review,
    };
    setAnswers((prev) => ({ ...prev, [currentQ.id]: updated }));
    triggerAutosave(currentQ.id, null, '', {}, updated.is_marked_for_review);
  };

  // Forward Navigation Handler
  const handleNextOrAdvance = async () => {
    if (isReadOnly) return;
    // Save current answer first
    if (currentQ) {
      await triggerAutosave(
        currentQ.id,
        currentAnswer.selected_option_id,
        currentAnswer.text_response,
        currentAnswer.answer_data,
        currentAnswer.is_marked_for_review
      );
    }

    if (isForwardOnly) {
      try {
        await studentAPI.advanceQuestion(attempt.id);
        setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
      } catch (err) {
        alert(err.response?.data?.error || 'Unable to advance question.');
      }
    } else {
      setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
    }
  };

  const handlePrevious = () => {
    if (isForwardOnly || currentIndex === 0 || isReadOnly) return;
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };



  // Summary counts for submission confirmation
  const totalQuestions = questions.length;
  const answeredCount = Object.values(answers).filter(
    (a) =>
      a.selected_option_id ||
      (a.text_response && a.text_response.trim()) ||
      (a.answer_data?.selected_option_ids && a.answer_data.selected_option_ids.length > 0) ||
      (a.answer_data?.blank_answers && a.answer_data.blank_answers.some((b) => b?.trim())) ||
      (a.answer_data?.pairs && Object.keys(a.answer_data.pairs).length > 0)
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

  // Render Question Input Control
  const renderQuestionInputControl = () => {
    if (!currentQ) return null;

    // 1. Multiple Choice (Single Answer)
    if (currentQ.question_type === 'MCQ') {
      return (
        <div className="options-list">
          {(currentQ.options || []).map((opt) => {
            const isSelected = currentAnswer.selected_option_id === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => !isReadOnly && handleSelectOption(opt.id)}
                className={`option-choice ${isSelected ? 'selected' : ''}`}
                style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="radio"
                  name={`q_${currentQ.id}`}
                  checked={isSelected}
                  onChange={() => !isReadOnly && handleSelectOption(opt.id)}
                  disabled={isReadOnly}
                  className="option-radio"
                />
                <span>{opt.option_text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // 2. Multiple Select (Multiple Answers)
    if (currentQ.question_type === 'MULTIPLE_SELECT') {
      const selectedIds = currentAnswer.answer_data?.selected_option_ids || [];
      return (
        <div className="options-list">
          <div style={{ fontSize: '13px', color: 'var(--primary)', marginBottom: '8px', fontWeight: '600' }}>
            Select all choices that apply:
          </div>
          {(currentQ.options || []).map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <div
                key={opt.id}
                onClick={() => !isReadOnly && handleToggleMultipleOption(opt.id)}
                className={`option-choice ${isSelected ? 'selected' : ''}`}
                style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => !isReadOnly && handleToggleMultipleOption(opt.id)}
                  disabled={isReadOnly}
                  className="option-radio"
                />
                <span>{opt.option_text}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // 3. True or False
    if (currentQ.question_type === 'TRUE_FALSE') {
      const selectedOptId = currentAnswer.selected_option_id;
      const trueOpt = (currentQ.options || []).find((o) => o.option_text.trim().toLowerCase() === 'true');
      const falseOpt = (currentQ.options || []).find((o) => o.option_text.trim().toLowerCase() === 'false');

      const isTrueSelected = selectedOptId === trueOpt?.id || currentAnswer.answer_data?.boolean_answer === true;
      const isFalseSelected = selectedOptId === falseOpt?.id || currentAnswer.answer_data?.boolean_answer === false;

      return (
        <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => handleTrueFalseSelect('True')}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '8px',
              border: isTrueSelected ? '3px solid var(--success)' : '1px solid var(--gray-300)',
              background: isTrueSelected ? 'var(--success-bg)' : '#ffffff',
              fontSize: '18px',
              fontWeight: '700',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              color: isTrueSelected ? 'var(--success)' : 'var(--gray-900)',
            }}
          >
            ✓ True
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => handleTrueFalseSelect('False')}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '8px',
              border: isFalseSelected ? '3px solid var(--danger)' : '1px solid var(--gray-300)',
              background: isFalseSelected ? 'var(--danger-bg)' : '#ffffff',
              fontSize: '18px',
              fontWeight: '700',
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
              color: isFalseSelected ? 'var(--danger)' : 'var(--gray-900)',
            }}
          >
            ✕ False
          </button>
        </div>
      );
    }

    // 4. Short Answer
    if (currentQ.question_type === 'SHORT_ANSWER') {
      return (
        <div style={{ marginTop: '20px' }}>
          <label className="form-label">Enter your short answer:</label>
          <input
            type="text"
            className="form-control"
            style={{ fontSize: '16px', padding: '12px 14px' }}
            value={currentAnswer.text_response || ''}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            disabled={isReadOnly}
            placeholder="Type your response..."
          />
        </div>
      );
    }

    // 5. Fill in the Blanks
    if (currentQ.question_type === 'FILL_IN_BLANKS') {
      const blanksCount = currentQ.question_metadata?.blanks_count || 1;
      const blankAnswers = currentAnswer.answer_data?.blank_answers || [];
      return (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label className="form-label">Fill in the missing word(s):</label>
          {Array.from({ length: blanksCount }).map((_, bIdx) => (
            <div key={bIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', width: '80px', color: 'var(--gray-700)' }}>
                Blank {bIdx + 1}:
              </span>
              <input
                type="text"
                className="form-control"
                placeholder={`Answer for Blank ${bIdx + 1}`}
                value={blankAnswers[bIdx] || ''}
                onChange={(e) => handleBlankChange(bIdx, e.target.value)}
                onBlur={handleTextBlur}
                disabled={isReadOnly}
              />
            </div>
          ))}
        </div>
      );
    }

    // 6. Matching
    if (currentQ.question_type === 'MATCHING') {
      const leftItems = currentQ.question_metadata?.left_items || [];
      const rightItems = currentQ.question_metadata?.right_items || [];
      const studentPairs = currentAnswer.answer_data?.pairs || {};

      return (
        <div style={{ marginTop: '20px' }}>
          <label className="form-label">Match each item in Column A with its corresponding match in Column B:</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            {leftItems.map((leftItem, lIdx) => (
              <div
                key={lIdx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                  {lIdx + 1}. {leftItem}
                </div>
                <div style={{ color: 'var(--gray-400)', fontWeight: 'bold' }}>➔</div>
                <div>
                  <select
                    className="form-control"
                    value={studentPairs[leftItem] || ''}
                    onChange={(e) => handleMatchingSelect(leftItem, e.target.value)}
                    disabled={isReadOnly}
                  >
                    <option value="">-- Select Match --</option>
                    {rightItems.map((rightItem, rIdx) => (
                      <option key={rIdx} value={rightItem}>
                        {rightItem}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 7. Numerical Answer
    if (currentQ.question_type === 'NUMERICAL') {
      return (
        <div style={{ marginTop: '20px' }}>
          <label className="form-label">Enter numeric answer (decimals accepted):</label>
          <input
            type="number"
            step="any"
            className="form-control"
            style={{ fontSize: '18px', padding: '12px 14px', maxWidth: '320px' }}
            value={currentAnswer.text_response || currentAnswer.answer_data?.numerical_value || ''}
            onChange={handleNumericalChange}
            onBlur={handleTextBlur}
            disabled={isReadOnly}
            placeholder="e.g. 42.5"
          />
        </div>
      );
    }

    // 8. Image-Based Question
    if (currentQ.question_type === 'IMAGE_BASED') {
      const imgSource = currentQ.image_url || (currentQ.image ? currentQ.image : null);
      return (
        <div style={{ marginTop: '16px' }}>
          {imgSource && (
            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
              <img
                src={imgSource}
                alt="Question graphic"
                style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '8px', border: '1px solid var(--gray-300)' }}
              />
            </div>
          )}
          {currentQ.options && currentQ.options.length > 0 ? (
            <div className="options-list">
              {currentQ.options.map((opt) => {
                const isSelected = currentAnswer.selected_option_id === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => !isReadOnly && handleSelectOption(opt.id)}
                    className={`option-choice ${isSelected ? 'selected' : ''}`}
                    style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
                  >
                    <input
                      type="radio"
                      name={`img_q_${currentQ.id}`}
                      checked={isSelected}
                      onChange={() => !isReadOnly && handleSelectOption(opt.id)}
                      disabled={isReadOnly}
                      className="option-radio"
                    />
                    <span>{opt.option_text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <textarea
              className="form-control"
              style={{ minHeight: '120px' }}
              value={currentAnswer.text_response || ''}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              disabled={isReadOnly}
              placeholder="Enter your observation or response..."
            />
          )}
        </div>
      );
    }

    // 9. Code-Based Question
    if (currentQ.question_type === 'CODE') {
      const lang = currentQ.question_metadata?.language || 'python';
      return (
        <div style={{ marginTop: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" style={{ margin: 0 }}>Code Editor ({lang}):</label>
            <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>Tab key and indentation supported</span>
          </div>
          <textarea
            className="form-control"
            style={{
              flex: 1,
              minHeight: '260px',
              fontFamily: '"Fira Code", monospace, "Courier New"',
              fontSize: '14px',
              lineHeight: '1.5',
              background: '#0f172a',
              color: '#f8fafc',
              tabSize: 4,
            }}
            value={currentAnswer.text_response || currentAnswer.answer_data?.code || currentQ.question_metadata?.starter_code || ''}
            onChange={handleCodeChange}
            onBlur={handleTextBlur}
            disabled={isReadOnly}
            placeholder={`# Write your ${lang} solution here...`}
          />
        </div>
      );
    }

    // 10. Long Answer / Descriptive
    return (
      <div style={{ marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label className="form-label">Type your response below (autosaves on typing):</label>
        <textarea
          className="form-control"
          style={{ flex: 1, minHeight: '220px', fontSize: '15px', lineHeight: '1.6' }}
          value={currentAnswer.text_response || ''}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          disabled={isReadOnly}
          placeholder="Type your explanation here..."
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--gray-50)' }}>
      {/* Top Persistent Warning Banner */}
      {activeWarning && (
        <div
          style={{
            background: activeWarning.isFinal || isFinalWarning ? '#fee2e2' : '#fef3c7',
            borderBottom: activeWarning.isFinal || isFinalWarning ? '2px solid #ef4444' : '1px solid #f59e0b',
            color: activeWarning.isFinal || isFinalWarning ? '#991b1b' : '#92400e',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '700',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{activeWarning.isFinal || isFinalWarning ? '🚨' : '⚠️'}</span>
            <span>{activeWarning.message}</span>
          </div>
          <button
            onClick={() => setActiveWarning(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Submission Failure Recovery Banner */}
      {submissionError && (
        <div
          style={{
            background: '#fef2f2',
            borderBottom: '2px solid #ef4444',
            color: '#991b1b',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 101,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div>{submissionError}</div>
              <div style={{ fontSize: '12px', fontWeight: '400', color: '#b91c1c' }}>
                Your autosaved answers are securely preserved on the server.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => handleFinalSubmit(false)}
              className="btn btn-primary btn-sm"
              style={{ background: '#b91c1c', borderColor: '#991b1b' }}
            >
              ↻ Retry Submission
            </button>
            <button
              onClick={() => setSubmissionError(null)}
              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="exam-room-header">
        <div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)', letterSpacing: '0.5px' }}>
            ONLINE EXAMINATION • ATTEMPT #{attempt.attempt_number || 1} • {isForwardOnly ? 'FORWARD ONLY' : 'FREE NAVIGATION'}
          </span>
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--gray-900)', margin: '2px 0 0 0' }}>
            {attempt.exam_title}
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Authoritative Warning Counter Display */}
          <span
            style={{
              fontSize: '12px',
              fontWeight: '700',
              color: warningsCount >= maxWarnings ? '#991b1b' : warningsCount >= 5 ? '#b45309' : '#374151',
              background: warningsCount >= maxWarnings ? '#fee2e2' : warningsCount >= 5 ? '#fef3c7' : '#f3f4f6',
              padding: '6px 12px',
              borderRadius: '14px',
              border: warningsCount >= maxWarnings ? '1px solid #ef4444' : '1px solid #e5e7eb',
            }}
          >
            Warnings: {warningsCount} / {maxWarnings}
          </span>

          <span style={{ fontSize: '13px', color: 'var(--gray-500)', fontStyle: 'italic' }}>
            {saveStatus}
          </span>

          <Timer
            initialSeconds={attempt.remaining_seconds}
            onExpire={() => handleAutoSubmit('time_expired')}
          />

          <button
            onClick={() => setShowSubmitModal(true)}
            className="btn btn-primary"
            style={{ fontWeight: '700' }}
            disabled={isReadOnly}
          >
            {submitting ? 'Submitting...' : 'Finish Exam'}
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
                    {currentQ.question_type}
                  </span>
                  {isForwardOnly && (
                    <span className="badge badge-warning" style={{ marginLeft: '6px' }}>
                      Forward Only
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--gray-900)' }}>
                    +{currentQ.marks} Marks
                  </span>
                  {parseFloat(currentQ.negative_marks) > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--danger)', marginLeft: '8px' }}>
                      (-{currentQ.negative_marks} neg)
                    </span>
                  )}
                </div>
              </div>

              <div className="question-text">{currentQ.question_text}</div>

              {/* Input Control for this Question Type */}
              {renderQuestionInputControl()}

              {/* Bottom Card Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '16px', borderTop: '1px solid var(--gray-200)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!isForwardOnly && (
                    <button
                      type="button"
                      onClick={handleToggleReview}
                      disabled={isReadOnly}
                      className={`btn ${currentAnswer.is_marked_for_review ? 'btn-danger' : 'btn-secondary'}`}
                    >
                      {currentAnswer.is_marked_for_review ? '★ Unmark Review' : '☆ Mark for Review'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    disabled={isReadOnly}
                    className="btn btn-secondary"
                  >
                    Clear Choice
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {!isForwardOnly && (
                    <button
                      type="button"
                      disabled={currentIndex === 0 || isReadOnly}
                      onClick={handlePrevious}
                      className="btn btn-secondary"
                    >
                      ‹ Previous
                    </button>
                  )}

                  {currentIndex < totalQuestions - 1 ? (
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={handleNextOrAdvance}
                      className="btn btn-primary"
                    >
                      Next Question ›
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => setShowSubmitModal(true)}
                      className="btn btn-primary"
                      style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                    >
                      Finish Exam ✓
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Palette & Proctoring Audit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Question Palette */}
          <div className="palette-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--gray-900)', margin: 0 }}>
                Question Palette
              </h3>
              {isForwardOnly && (
                <span style={{ fontSize: '11px', color: '#b45309', fontWeight: '600' }}>
                  Forward Only
                </span>
              )}
            </div>

            <div className="palette-grid">
              {questions.map((q, idx) => {
                const ans = answers[q.id] || {};
                const hasAnswer =
                  ans.selected_option_id ||
                  (ans.text_response && ans.text_response.trim()) ||
                  (ans.answer_data?.selected_option_ids && ans.answer_data.selected_option_ids.length > 0) ||
                  (ans.answer_data?.blank_answers && ans.answer_data.blank_answers.some((b) => b?.trim())) ||
                  (ans.answer_data?.pairs && Object.keys(ans.answer_data.pairs).length > 0);

                const isMarked = ans.is_marked_for_review;
                const isCurrent = idx === currentIndex;
                const isPast = idx < currentIndex;
                const isFuture = idx > currentIndex;

                let stateClass = '';
                if (isMarked) stateClass = 'marked';
                else if (hasAnswer) stateClass = 'answered';

                // In forward-only mode, only the current question is accessible
                const isClickable = !isForwardOnly && !isReadOnly;

                return (
                  <button
                    key={q.id}
                    disabled={!isClickable}
                    onClick={() => isClickable && setCurrentIndex(idx)}
                    className={`palette-btn ${stateClass} ${isCurrent ? 'current' : ''}`}
                    title={
                      isForwardOnly
                        ? isPast
                          ? `Q${idx + 1}: Completed (Cannot return in Forward Only)`
                          : isFuture
                          ? `Q${idx + 1}: Locked`
                          : `Q${idx + 1}: Current Question`
                        : `Go to Question ${idx + 1}`
                    }
                    style={{
                      cursor: isClickable ? 'pointer' : 'default',
                      opacity: isForwardOnly && !isCurrent ? 0.6 : 1,
                    }}
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
              {!isForwardOnly && (
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--warning)' }} />
                  <span>Marked for Review ({markedCount})</span>
                </div>
              )}
              <div className="legend-item">
                <span className="legend-dot" style={{ background: 'var(--gray-300)' }} />
                <span>Unanswered ({unansweredCount})</span>
              </div>
            </div>
          </div>

          {/* Transparent Webcam & Face Detection Module */}
          <ProctoringBadge
            attemptId={attempt.id}
            enableProctoring={attempt.enable_proctoring && !attempt.is_completed && !submitting}
            onFullscreenWarning={handleFullscreenWarning}
            onWarning={handleProctoringWarning}
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
        onConfirm={() => handleFinalSubmit(false, 'manual')}
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
