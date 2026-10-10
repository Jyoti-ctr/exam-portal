import React, { useEffect, useRef, useState } from 'react';
import { studentAPI } from '../api/client';

export const ProctoringBadge = ({ attemptId, enableProctoring = true, onFullscreenWarning }) => {
  const videoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    if (!enableProctoring || !attemptId) return;

    let stream = null;

    // 1. Initialize camera with transparent permission prompt
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'CAMERA_RECONNECTED',
          details: { message: 'Webcam feed initialized successfully.' },
        }).catch(() => {});
      } catch (err) {
        setCameraError('Camera blocked or unavailable.');
        setCameraActive(false);
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'CAMERA_DISCONNECTED',
          details: { error: err.name || 'PermissionDenied' },
        }).catch(() => {});
      }
    };

    startCamera();

    // 2. Track tab blur / visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'TAB_BLUR',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      } else {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'TAB_FOCUS',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    // 3. Track fullscreen exits
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'FULLSCREEN_EXIT',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
        if (onFullscreenWarning) onFullscreenWarning();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [attemptId, enableProctoring, onFullscreenWarning]);

  if (!enableProctoring) return null;

  return (
    <div>
      <div className="webcam-tile">
        {cameraActive ? (
          <video ref={videoRef} autoPlay playsInline muted className="webcam-video" />
        ) : (
          <div style={{ color: 'var(--gray-400)', fontSize: '12px', padding: '16px', textAlign: 'center' }}>
            {cameraError || 'Initializing camera feed...'}
          </div>
        )}
        <div className="webcam-badge">
          <span className="webcam-indicator-dot" style={{ background: cameraActive ? '#22c55e' : '#ef4444' }} />
          <span>{cameraActive ? 'MONITORING ACTIVE' : 'NO CAMERA'}</span>
        </div>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '6px', textAlign: 'center' }}>
        Transparent Proctoring: Tabs & Fullscreen activity are logged for audit.
      </p>
    </div>
  );
};
