import React from 'react';

export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: 'var(--gray-900)' }}>
          {title}
        </h3>
        {message && (
          <p style={{ fontSize: '14px', color: 'var(--gray-600)', marginBottom: '16px' }}>
            {message}
          </p>
        )}
        {children && <div style={{ marginBottom: '20px' }}>{children}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn btn-${confirmVariant}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
