import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Auth token if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('exam_token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token if expired or invalid
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('exam_token');
        localStorage.removeItem('exam_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==========================================
// API HELPER SERVICES
// ==========================================

export const authAPI = {
  login: (credentials) => api.post('/auth/login/', credentials),
  register: (studentData) => api.post('/auth/register/', studentData),
  logout: () => api.post('/auth/logout/'),
  getMe: () => api.get('/auth/me/'),
};

export const studentAPI = {
  getAvailableExams: () => api.get('/student/exams/'),
  getExamInstructions: (examId) => api.get(`/student/exams/${examId}/`),
  startOrResumeAttempt: (examId) => api.post(`/student/exams/${examId}/start/`),
  autosaveAnswer: (attemptId, payload) => api.post(`/student/attempts/${attemptId}/autosave/`, payload),
  heartbeat: (attemptId) => api.post(`/student/attempts/${attemptId}/heartbeat/`),
  submitAttempt: (attemptId) => api.post(`/student/attempts/${attemptId}/submit/`),
  logProctoringEvent: (payload) => api.post('/student/events/', payload),
  getAttemptDetails: (attemptId) => api.get(`/student/attempts/${attemptId}/`),
  getAttemptResult: (attemptId) => api.get(`/student/results/${attemptId}/`),
  getPublishedResults: () => api.get('/student/results/'),
  acknowledgeResult: (resultId, notes = '') => api.post(`/student/results/${resultId}/acknowledge/`, { notes }),
  requestClarification: (resultId, message) => api.post(`/student/results/${resultId}/request-clarification/`, { message }),
};

export const facultyAPI = {
  getExams: () => api.get('/faculty/exams/'),
  getExam: (examId) => api.get(`/faculty/exams/${examId}/`),
  createExam: (data) => api.post('/faculty/exams/', data),
  updateExam: (examId, data) => api.put(`/faculty/exams/${examId}/`, data),
  deleteExam: (examId) => api.delete(`/faculty/exams/${examId}/`),
  togglePublish: (examId) => api.post(`/faculty/exams/${examId}/toggle-publish/`),
  
  getQuestions: (examId) => api.get(`/faculty/exams/${examId}/questions/`),
  createQuestion: (examId, data) => api.post(`/faculty/exams/${examId}/questions/`, data),
  updateQuestion: (questionId, data) => api.put(`/faculty/questions/${questionId}/`, data),
  deleteQuestion: (questionId) => api.delete(`/faculty/questions/${questionId}/`),

  getAttempts: (examId) => api.get(`/faculty/exams/${examId}/attempts/`),
  getSubmissions: (examId) => api.get(`/faculty/exams/${examId}/submissions/`),
  getReviewDetail: (attemptId) => api.get(`/faculty/attempts/${attemptId}/review-detail/`),
  saveReview: (attemptId, payload) => api.post(`/faculty/attempts/${attemptId}/save-review/`, payload),
  publishReview: (attemptId) => api.post(`/faculty/attempts/${attemptId}/publish-review/`),
  flagSubmission: (attemptId, payload) => api.post(`/faculty/attempts/${attemptId}/flag-submission/`, payload),
  respondClarification: (attemptId, payload) => api.post(`/faculty/attempts/${attemptId}/respond-clarification/`, payload),

  getProctoringEvents: (attemptId) => api.get(`/faculty/attempts/${attemptId}/events/`),
  getAttemptAnalysis: (attemptId) => api.get(`/faculty/attempts/${attemptId}/analysis/`),
  bulkReviewIncident: (attemptId, payload) => api.post(`/faculty/attempts/${attemptId}/bulk-review/`, payload),
  reviewProctoringEvent: (eventId, reviewStatus = 'REVIEWED', notes = '') =>
    api.patch(`/faculty/events/${eventId}/review/`, { review_status: reviewStatus, reviewer_notes: notes, is_reviewed: true }),

  getResults: (examId) => api.get(`/faculty/exams/${examId}/results/`),
  evaluateAnswer: (payload) => api.post('/faculty/results/evaluate-answer/', payload),
  publishResults: (examId, isPublished) => api.post(`/faculty/exams/${examId}/publish-results/`, { is_published: isPublished }),
};


export default api;
