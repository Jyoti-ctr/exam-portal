import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('exam_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('exam_token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('exam_token');
      if (storedToken) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
          localStorage.setItem('exam_user', JSON.stringify(res.data));
        } catch {
          // Token expired or invalid
          setUser(null);
          setToken(null);
          localStorage.removeItem('exam_token');
          localStorage.removeItem('exam_user');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password });
    const { token: authToken, user: authUser } = res.data;
    setToken(authToken);
    setUser(authUser);
    localStorage.setItem('exam_token', authToken);
    localStorage.setItem('exam_user', JSON.stringify(authUser));
    return authUser;
  };

  const register = async (studentData) => {
    const res = await authAPI.register(studentData);
    const { token: authToken, user: authUser } = res.data;
    setToken(authToken);
    setUser(authUser);
    localStorage.setItem('exam_token', authToken);
    localStorage.setItem('exam_user', JSON.stringify(authUser));
    return authUser;
  };

  const logout = async () => {
    try {
      if (typeof window !== 'undefined' && window.__stopAllExamCameras) {
        window.__stopAllExamCameras();
      }
      await authAPI.logout();
    } catch {
      // Ignore errors on logout
    } finally {
      if (typeof window !== 'undefined' && window.__stopAllExamCameras) {
        window.__stopAllExamCameras();
      }
      setUser(null);
      setToken(null);
      localStorage.removeItem('exam_token');
      localStorage.removeItem('exam_user');
    }
  };

  const isStudent = user?.role === 'STUDENT';
  const isFaculty = user?.role === 'FACULTY';
  const isAuthenticated = !!token && !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        isStudent,
        isFaculty,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
