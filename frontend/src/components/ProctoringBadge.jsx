import React, { useEffect, useRef, useState } from 'react';
import { studentAPI } from '../api/client';
import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';

export const ProctoringBadge = ({
  attemptId,
  enableProctoring = true,
  onFullscreenWarning,
  onWarning,
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const animFrameRef = useRef(null);

  // Status & Telemetry
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Initializing webcam...');
  const [faceCount, setFaceCount] = useState(1);
  const [modelReady, setModelReady] = useState(false);
  const [lastWarningMsg, setLastWarningMsg] = useState(null);

  // Interval Tracking Refs (to avoid stale closures in detection loop)
  const noFaceDurationRef = useRef(0);
  const multiFaceDurationRef = useRef(0);
  const lastLoggedEventRef = useRef({ NO_FACE: 0, MULTI_FACE: 0 });

  useEffect(() => {
    if (!enableProctoring || !attemptId) return;

    let isMounted = true;

    // 1. Initialize Webcam
    const initWebcam = async () => {
      try {
        setCameraStatus('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { max: 15 } },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().catch(() => {});
          };
        }
        setCameraActive(true);
        setCameraStatus('Live Feed Active');

        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'CAMERA_RECONNECTED',
          details: { message: 'Webcam feed established.' },
        }).catch(() => {});
      } catch (err) {
        if (!isMounted) return;
        const errMsg = err.name === 'NotAllowedError'
          ? 'Camera permission denied.'
          : 'Camera blocked or unavailable.';
        setCameraStatus(errMsg);
        setCameraActive(false);

        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'CAMERA_DISCONNECTED',
          details: { error: err.name || 'Unavailable' },
        }).catch(() => {});

        if (onWarning) {
          onWarning({
            type: 'CAMERA_ERROR',
            message: 'Camera permission denied or camera disconnected. Please ensure webcam is accessible.',
          });
        }
      }
    };

    // 2. Initialize MediaPipe Face Detector
    const initFaceDetector = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        let detector;
        try {
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
          });
        } catch {
          // Fallback to CPU if GPU delegate is unavailable
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
          });
        }

        if (!isMounted) return;
        detectorRef.current = detector;
        setModelReady(true);
      } catch (err) {
        console.warn('Face detection model init failed; operating with basic camera proctoring:', err);
        if (isMounted) {
          setModelReady(false);
          setCameraStatus('Monitoring Active (Vision Fallback)');
        }
      }
    };

    initWebcam();
    initFaceDetector();

    // 3. Tab Visibility & Fullscreen Listeners
    const handleVisibilityChange = () => {
      if (document.hidden) {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'TAB_BLUR',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});

        if (onWarning) {
          onWarning({
            type: 'TAB_SWITCH',
            message: 'You navigated away or switched tabs. Tab switches are logged for instructor audit.',
          });
        }
      } else {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'TAB_FOCUS',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    const handleWindowBlur = () => {
      studentAPI.logProctoringEvent({
        attempt_id: attemptId,
        event_type: 'TAB_BLUR',
        details: { signal: 'window_blur', timestamp: new Date().toISOString() },
      }).catch(() => {});
    };

    const handleWindowFocus = () => {
      studentAPI.logProctoringEvent({
        attempt_id: attemptId,
        event_type: 'TAB_FOCUS',
        details: { signal: 'window_focus', timestamp: new Date().toISOString() },
      }).catch(() => {});
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'FULLSCREEN_EXIT',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});

        if (onFullscreenWarning) onFullscreenWarning();
        if (onWarning) {
          onWarning({
            type: 'FULLSCREEN_EXIT',
            message: 'Fullscreen mode exited. Please stay in fullscreen during your exam.',
          });
        }
      } else {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'FULLSCREEN_ENTER',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);

      if (animFrameRef.current) {
        clearInterval(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (detectorRef.current) {
        try {
          detectorRef.current.close();
        } catch {}
      }
    };
  }, [attemptId, enableProctoring, onFullscreenWarning, onWarning]);

  // Periodic Face Detection Loop (Every 600ms)
  useEffect(() => {
    if (!modelReady || !cameraActive) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;

      try {
        const detections = detector.detectForVideo(video, performance.now());
        const count = detections?.detections?.length ?? 0;
        setFaceCount(count);

        const now = Date.now();

        if (count === 0) {
          noFaceDurationRef.current += 0.6;
          multiFaceDurationRef.current = 0;

          // Trigger NO_FACE if absent continuously for >= 5 seconds (with 15s cooldown)
          if (
            noFaceDurationRef.current >= 5 &&
            now - lastLoggedEventRef.current.NO_FACE > 15000
          ) {
            lastLoggedEventRef.current.NO_FACE = now;
            setLastWarningMsg('No face detected. Please face the webcam.');

            studentAPI.logProctoringEvent({
              attempt_id: attemptId,
              event_type: 'NO_FACE_DETECTED',
              details: {
                face_count: 0,
                duration_seconds: Math.round(noFaceDurationRef.current),
              },
            }).catch(() => {});

            if (onWarning) {
              onWarning({
                type: 'NO_FACE',
                message: 'No face detected in webcam frame. Please ensure your face is clearly visible.',
              });
            }
          }
        } else if (count > 1) {
          multiFaceDurationRef.current += 0.6;
          noFaceDurationRef.current = 0;

          // Trigger MULTIPLE_FACES if >1 face continuously for >= 3 seconds (with 15s cooldown)
          if (
            multiFaceDurationRef.current >= 3 &&
            now - lastLoggedEventRef.current.MULTI_FACE > 15000
          ) {
            lastLoggedEventRef.current.MULTI_FACE = now;
            setLastWarningMsg(`Multiple faces detected (${count} visible).`);

            studentAPI.logProctoringEvent({
              attempt_id: attemptId,
              event_type: 'MULTIPLE_FACES_DETECTED',
              details: {
                face_count: count,
                duration_seconds: Math.round(multiFaceDurationRef.current),
              },
            }).catch(() => {});

            if (onWarning) {
              onWarning({
                type: 'MULTIPLE_FACES',
                message: `Multiple faces (${count}) detected in camera. Only the authorized examinee should be present.`,
              });
            }
          }
        } else {
          // Exactly 1 face - normal
          noFaceDurationRef.current = 0;
          multiFaceDurationRef.current = 0;
          setLastWarningMsg(null);
        }
      } catch (err) {
        // Suppress frame processing hiccups
      }
    }, 600);

    animFrameRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [modelReady, cameraActive, attemptId, onWarning]);

  if (!enableProctoring) return null;

  return (
    <div>
      <div className="webcam-tile" style={{ position: 'relative', overflow: 'hidden', borderRadius: '10px' }}>
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="webcam-video"
            style={{ width: '100%', height: '170px', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        ) : (
          <div
            style={{
              height: '170px',
              color: 'var(--gray-400)',
              fontSize: '12px',
              padding: '24px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0f172a',
            }}
          >
            {cameraStatus}
          </div>
        )}

        {/* Live Top Status Pill */}
        <div className="webcam-badge" style={{ position: 'absolute', top: '8px', left: '8px' }}>
          <span
            className="webcam-indicator-dot"
            style={{
              background: !cameraActive
                ? '#ef4444'
                : faceCount === 1
                ? '#22c55e'
                : faceCount === 0
                ? '#f59e0b'
                : '#ef4444',
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: '700' }}>
            {!cameraActive
              ? 'NO CAMERA'
              : !modelReady
              ? 'MONITORING ACTIVE'
              : faceCount === 1
              ? '1 FACE VERIFIED'
              : faceCount === 0
              ? 'NO FACE VISIBLE'
              : `${faceCount} FACES DETECTED`}
          </span>
        </div>

        {/* Bottom Alert Pill if Anomaly */}
        {lastWarningMsg && (
          <div
            style={{
              position: 'absolute',
              bottom: '6px',
              left: '6px',
              right: '6px',
              background: 'rgba(239, 68, 68, 0.9)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: '600',
              padding: '4px 8px',
              borderRadius: '4px',
              textAlign: 'center',
            }}
          >
            ⚠️ {lastWarningMsg}
          </div>
        )}
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--gray-500)', textAlign: 'center' }}>
        Live Local Integrity Monitoring: Fullscreen, Tab & Face signals are recorded.
      </div>
    </div>
  );
};
