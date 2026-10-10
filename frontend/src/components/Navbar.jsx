import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Navbar = () => {
  const { user, isAuthenticated, isFaculty, isStudent, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isAuthenticated) return null;

  // Don't show general navbar inside the active exam room to minimize distraction
  if (location.pathname.startsWith('/exam/take/')) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>SecureExam</span>
        </Link>
        <span className="navbar-brand-badge">PROCTOR ACTIVE</span>
      </div>

      <div className="navbar-links">
        {isFaculty && (
          <>
            <Link to="/faculty" className={`nav-link ${location.pathname === '/faculty' ? 'active' : ''}`}>
              Exams
            </Link>
            <Link to="/faculty/exams/new" className={`nav-link ${location.pathname === '/faculty/exams/new' ? 'active' : ''}`}>
              + New Exam
            </Link>
          </>
        )}

        {isStudent && (
          <>
            <Link to="/student" className={`nav-link ${location.pathname === '/student' ? 'active' : ''}`}>
              Exams
            </Link>
            <Link to="/student/results" className={`nav-link ${location.pathname === '/student/results' ? 'active' : ''}`}>
              Results
            </Link>
          </>
        )}

        <div className="user-profile-menu">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--gray-900)' }}>
              {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
            </span>
            <span className={`role-badge ${isFaculty ? 'faculty' : 'student'}`}>
              {user?.role}
            </span>
          </div>

          <button onClick={handleLogout} className="btn btn-secondary btn-sm" title="Sign out">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
};
