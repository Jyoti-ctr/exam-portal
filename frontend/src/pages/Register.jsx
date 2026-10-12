import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    rollNumber: '',
    department: '',
    batch: '2026',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side quick checks
    if (formData.password !== formData.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    if (formData.password.length < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters long.' });
      return;
    }

    setLoading(true);

    try {
      await register({
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        roll_number: formData.rollNumber.trim().toUpperCase(),
        department: formData.department.trim(),
        batch: formData.batch.trim(),
        password: formData.password,
        confirm_password: formData.confirmPassword,
      });

      navigate('/student');
    } catch (err) {
      const data = err.response?.data;
      if (typeof data === 'object' && data !== null) {
        if (data.non_field_errors) {
          setError(data.non_field_errors[0]);
        } else if (data.detail) {
          setError(data.detail);
        } else if (data.error) {
          setError(data.error);
        } else {
          // Field-specific validation errors from Django REST Framework
          const specific = {};
          Object.keys(data).forEach((key) => {
            const val = Array.isArray(data[key]) ? data[key][0] : data[key];
            if (key === 'roll_number') specific.rollNumber = val;
            else if (key === 'first_name') specific.firstName = val;
            else if (key === 'last_name') specific.lastName = val;
            else specific[key] = val;
          });
          setFieldErrors(specific);
          setError('Please resolve the errors highlighted below.');
        }
      } else {
        setError('Registration failed. Please check your network connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: '24px 16px' }}>
      <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--primary-light)', borderRadius: '12px', marginBottom: '12px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7.5" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--gray-900)', margin: '0 0 6px 0' }}>
            Student Account Registration
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--gray-500)', margin: 0 }}>
            Create your student profile to access assigned examinations and view results
          </p>
        </div>

        {/* Security badge: Public registration is strictly for students */}
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🛡️</span>
          <span>
            <strong>Role Enforcement:</strong> Public registration is strictly limited to Student accounts. Faculty and admin accounts are provisioned exclusively by university system administrators.
          </span>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '18px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                type="text"
                name="firstName"
                required
                className="form-control"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="e.g. Alice"
              />
              {fieldErrors.firstName && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.firstName}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                name="lastName"
                required
                className="form-control"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="e.g. Smith"
              />
              {fieldErrors.lastName && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.lastName}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input
                type="text"
                name="username"
                required
                className="form-control"
                value={formData.username}
                onChange={handleChange}
                placeholder="e.g. alice_smith"
              />
              {fieldErrors.username && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.username}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                name="email"
                required
                className="form-control"
                value={formData.email}
                onChange={handleChange}
                placeholder="alice@university.edu"
              />
              {fieldErrors.email && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.email}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Roll Number / ID *</label>
              <input
                type="text"
                name="rollNumber"
                required
                className="form-control"
                value={formData.rollNumber}
                onChange={handleChange}
                placeholder="STU-2026-042"
              />
              {fieldErrors.rollNumber && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.rollNumber}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Department *</label>
              <input
                type="text"
                name="department"
                required
                className="form-control"
                value={formData.department}
                onChange={handleChange}
                placeholder="Computer Science"
              />
              {fieldErrors.department && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.department}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Batch</label>
              <input
                type="text"
                name="batch"
                className="form-control"
                value={formData.batch}
                onChange={handleChange}
                placeholder="2026"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Password * (Min 8 chars)</label>
              <input
                type="password"
                name="password"
                required
                className="form-control"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
              />
              {fieldErrors.password && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.password}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                required
                className="form-control"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
              />
              {fieldErrors.confirmPassword && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>{fieldErrors.confirmPassword}</div>}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '8px' }}
          >
            {loading ? 'Creating Student Account...' : 'Complete Registration ➜'}
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--gray-200)', textAlign: 'center', fontSize: '13px', color: 'var(--gray-600)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: '600', textDecoration: 'none' }}>
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
};
