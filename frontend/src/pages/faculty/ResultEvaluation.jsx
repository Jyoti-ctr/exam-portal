import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { facultyAPI } from '../../api/client';

export const ResultEvaluation = () => {
  const { examId } = useParams();

  const [exam, setExam] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Evaluate Descriptive Modal
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [evalMarks, setEvalMarks] = useState({});
  const [evalComments, setEvalComments] = useState({});
  const [savingEval, setSavingEval] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [examRes, resRes] = await Promise.all([
        facultyAPI.getExam(examId),
        facultyAPI.getResults(examId),
      ]);
      setExam(examRes.data);
      setResults(resRes.data);
    } catch {
      alert('Failed to load results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [examId]);

  const handleTogglePublish = async (shouldPublish) => {
    try {
      await facultyAPI.publishResults(examId, shouldPublish);
      loadData();
    } catch {
      alert('Failed to update result publication status.');
    }
  };

  const handleOpenEvaluation = async (attemptId) => {
    try {
      const res = await facultyAPI.getAttempts(examId);
      const att = res.data.find((a) => a.id === attemptId);
      if (att) {
        setCurrentAttempt(att);
        // Pre-fill existing marks if any
        const initialMarks = {};
        const initialComments = {};
        (att.saved_answers || []).forEach((ans) => {
          if (ans.awarded_marks !== null && ans.awarded_marks !== undefined) {
            initialMarks[ans.id] = ans.awarded_marks;
          }
        });
        setEvalMarks(initialMarks);
        setEvalComments(initialComments);
        setEvalModalOpen(true);
      }
    } catch {
      alert('Unable to load attempt details for grading.');
    }
  };

  const handleSaveAnswerGrade = async (answerId) => {
    const marks = evalMarks[answerId];
    if (marks === undefined || marks === '') {
      alert('Please enter a marks value.');
      return;
    }

    try {
      setSavingEval(true);
      await facultyAPI.evaluateAnswer({
        answer_id: answerId,
        awarded_marks: parseFloat(marks),
        evaluator_comment: evalComments[answerId] || '',
      });
      alert('Marks saved successfully!');
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save grade.');
    } finally {
      setSavingEval(false);
    }
  };

  const isAllPublished = results.length > 0 && results.every((r) => r.is_published);

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
            Gradebook & Results: {exam?.title || 'Exam'}
          </h1>
          <p className="page-subtitle">
            Evaluate descriptive answers and publish official scores to students
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleTogglePublish(!isAllPublished)}
            className={`btn ${isAllPublished ? 'btn-danger' : 'btn-success'}`}
          >
            {isAllPublished ? 'Unpublish All Results' : 'Publish Results to Students 📢'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--gray-500)' }}>Loading gradebook...</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
            <p style={{ fontSize: '16px', fontWeight: '500' }}>No submitted attempts to evaluate yet.</p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>Results will appear here as soon as students submit their exams.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Objective (MCQ)</th>
                  <th>Descriptive</th>
                  <th>Total Score</th>
                  <th>Percentage</th>
                  <th>Status</th>
                  <th>Public Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--gray-900)' }}>
                        {r.student_name || r.student_username}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                        Roll: {r.roll_number || 'N/A'}
                      </div>
                    </td>
                    <td>{r.objective_score} marks</td>
                    <td>{r.descriptive_score} marks</td>
                    <td>
                      <strong style={{ fontSize: '16px', color: r.passed ? 'var(--success)' : 'var(--danger)' }}>
                        {r.total_score} / {r.exam_total_marks}
                      </strong>
                    </td>
                    <td>{r.percentage}%</td>
                    <td>
                      {r.passed ? (
                        <span className="badge badge-success">PASSED</span>
                      ) : (
                        <span className="badge badge-danger">FAILED</span>
                      )}
                    </td>
                    <td>
                      {r.is_published ? (
                        <span className="badge badge-success">Released</span>
                      ) : (
                        <span className="badge badge-neutral">Private</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleOpenEvaluation(r.attempt)}
                        className="btn btn-secondary btn-sm"
                      >
                        Evaluate Essay Answers ✍️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evaluate Descriptive Answers Modal */}
      {evalModalOpen && currentAttempt && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800' }}>
                Evaluate Descriptive Responses (Attempt #{currentAttempt.id})
              </h2>
              <button onClick={() => setEvalModalOpen(false)} className="btn btn-secondary btn-sm">
                Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
              {currentAttempt.questions?.filter((q) => q.question_type === 'DESCRIPTIVE').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-500)' }}>
                  This exam only contains objective MCQ questions (already auto-graded).
                </div>
              ) : (
                currentAttempt.questions
                  ?.filter((q) => q.question_type === 'DESCRIPTIVE')
                  .map((q) => {
                    const ans = (currentAttempt.saved_answers || []).find((a) => a.question_id === q.id) || {};
                    return (
                      <div key={q.id} style={{ border: '1px solid var(--gray-200)', borderRadius: '8px', padding: '16px', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--primary)' }}>
                            Question (Max {q.marks} Marks)
                          </span>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '12px' }}>
                          {q.question_text}
                        </div>

                        <div style={{ background: 'var(--gray-50)', padding: '12px', borderRadius: '6px', border: '1px solid var(--gray-200)', marginBottom: '12px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--gray-500)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Student Written Response:
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--gray-800)', whiteSpace: 'pre-wrap' }}>
                            {ans.text_response || <em style={{ color: 'var(--gray-400)' }}>No text submitted for this question.</em>}
                          </div>
                        </div>

                        {ans.id ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '12px' }}>Marks (0 - {q.marks})</label>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={q.marks}
                                className="form-control"
                                value={evalMarks[ans.id] !== undefined ? evalMarks[ans.id] : ''}
                                onChange={(e) => setEvalMarks((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                              />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '12px' }}>Evaluator Feedback</label>
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Optional feedback..."
                                value={evalComments[ans.id] !== undefined ? evalComments[ans.id] : ''}
                                onChange={(e) => setEvalComments((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                              />
                            </div>
                            <button
                              onClick={() => handleSaveAnswerGrade(ans.id)}
                              disabled={savingEval}
                              className="btn btn-primary btn-sm"
                              style={{ height: '38px' }}
                            >
                              Save Grade
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                            No answer record available.
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
