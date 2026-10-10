import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';

// Student Pages
import { StudentDashboard } from './pages/student/StudentDashboard';
import { ExamInstructions } from './pages/student/ExamInstructions';
import { ExamRoom } from './pages/student/ExamRoom';
import { SubmissionSuccess } from './pages/student/SubmissionSuccess';
import { StudentResults } from './pages/student/StudentResults';

// Faculty Pages
import { FacultyDashboard } from './pages/faculty/FacultyDashboard';
import { ExamForm } from './pages/faculty/ExamForm';
import { QuestionManager } from './pages/faculty/QuestionManager';
import { AttemptMonitor } from './pages/faculty/AttemptMonitor';
import { ResultEvaluation } from './pages/faculty/ResultEvaluation';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: 'var(--gray-500)' }}>
        Verifying credentials...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'FACULTY' ? '/faculty' : '/student'} replace />;
  }

  return children;
};

const RootRedirect = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'FACULTY' ? '/faculty' : '/student'} replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Student Protected Routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/exams/:examId/instructions"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <ExamInstructions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exam/take/:examId"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <ExamRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/submitted"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <SubmissionSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/results"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <StudentResults />
              </ProtectedRoute>
            }
          />

          {/* Faculty Protected Routes */}
          <Route
            path="/faculty"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <FacultyDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty/exams/new"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <ExamForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId/edit"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <ExamForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId/questions"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <QuestionManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId/attempts"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <AttemptMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId/results"
            element={
              <ProtectedRoute requiredRole="FACULTY">
                <ResultEvaluation />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
