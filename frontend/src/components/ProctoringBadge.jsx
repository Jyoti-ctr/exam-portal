import React, { useEffect, useRef, useState, useCallback } from 'react';
import { studentAPI } from '../api/client';
import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';

import {
  ProctoringState,
  STATE_CONFIG,
  isCameraStreamLive,
  stopMediaStream,
  stopAllCameraStreams,
  requestManagedCamera,
} from '../utils/proctoringHelpers';

export { ProctoringState, STATE_CONFIG, isCameraStreamLive, stopMediaStream, stopAllCameraStreams };

// Module-level singleton cache for MediaPipe FaceDetector to prevent repeated downloads
let sharedVisionPromise = null;
let sharedDetectorPromise = null;

async function getSharedFaceDetector() {
  if (!sharedVisionPromise) {
    sharedVisionPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
  }
  if (!sharedDetectorPromise) {
    sharedDetectorPromise = (async () => {
      const vision = await sharedVisionPromise;
      try {
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
        });
      } catch (err) {
        console.warn('GPU delegate not supported for MediaPipe FaceDetector, falling back to CPU:', err);
        return await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
        });
      }
    })();
  }
  return sharedDetectorPromise;
}


const ProctoringBadgeComponent = ({
  attemptId,
  enableProctoring = true,
  onFullscreenWarning,
  onWarning,
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  // Status & Telemetry
  const [monitoringState, setMonitoringState] = useState(ProctoringState.CAMERA_INITIALIZING);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [cameraStatusMsg, setCameraStatusMsg] = useState('Initializing webcam...');
  const [faceCount, setFaceCount] = useState(null); // Never default to 1!
  const [lastWarningMsg, setLastWarningMsg] = useState(null);

  // Synchronous refs for intervals & closures
  const monitoringStateRef = useRef(ProctoringState.CAMERA_INITIALIZING);
  monitoringStateRef.current = monitoringState;

  const onWarningRef = useRef(onWarning);
  const onFullscreenWarningRef = useRef(onFullscreenWarning);
  useEffect(() => {
    onWarningRef.current = onWarning;
    onFullscreenWarningRef.current = onFullscreenWarning;
  });

  const noFaceDurationRef = useRef(0);
  const multiFaceDurationRef = useRef(0);
  const lastLoggedEventRef = useRef({ NO_FACE: 0, MULTI_FACE: 0, DISCONNECT: 0 });
  const lastVideoTimeRef = useRef(-1);
  const frozenFrameCountRef = useRef(0);
  const isUnmountedRef = useRef(false);

  // Stops all media tracks, releases video resources, and clears detection intervals
  const stopCameraStream = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    stopMediaStream(streamRef.current, videoRef.current);
    stopAllCameraStreams(videoRef.current);
    streamRef.current = null;
    setIsCameraLive(false);
    setFaceCount(null);
    setMonitoringState(ProctoringState.CAMERA_UNAVAILABLE);
    setCameraStatusMsg('Camera closed');
  }, []);

  // Ensure camera is immediately stopped when enableProctoring becomes false
  useEffect(() => {
    if (!enableProctoring) {
      stopCameraStream();
    }
  }, [enableProctoring, stopCameraStream]);

  // Expose global cleaner so submission handlers can stop the stream synchronously
  useEffect(() => {
    window.__stopExamWebcam = stopCameraStream;
    return () => {
      stopCameraStream();
      if (window.__stopExamWebcam === stopCameraStream) {
        window.__stopExamWebcam = null;
      }
    };
  }, [stopCameraStream]);

  // Handles camera becoming stopped, revoked, or unavailable
  const handleCameraUnavailable = useCallback((reason = 'Camera stopped or unavailable') => {
    if (isUnmountedRef.current) return;
    monitoringStateRef.current = ProctoringState.CAMERA_UNAVAILABLE;
    setMonitoringState(ProctoringState.CAMERA_UNAVAILABLE);
    setFaceCount(null); // Clear previous face count immediately
    setIsCameraLive(false);
    setCameraStatusMsg(reason);

    const now = Date.now();
    if (now - lastLoggedEventRef.current.DISCONNECT > 6000) {
      lastLoggedEventRef.current.DISCONNECT = now;
      studentAPI.logProctoringEvent({
        attempt_id: attemptId,
        event_type: 'CAMERA_DISCONNECTED',
        details: { reason, timestamp: new Date().toISOString() },
      }).catch(() => {});

      if (onWarningRef.current) {
        onWarningRef.current({
          type: 'CAMERA_DISCONNECTED',
          message: 'Webcam feed was disconnected or stopped. Please reconnect your camera.',
        });
      }
    }
  }, [attemptId]);

  // Handles camera feed restored
  const handleCameraRestored = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (isCameraStreamLive(streamRef.current)) {
      setIsCameraLive(true);
      setMonitoringState(ProctoringState.CAMERA_ACTIVE_PENDING);
      monitoringStateRef.current = ProctoringState.CAMERA_ACTIVE_PENDING;
      setCameraStatusMsg('Live Feed Restored');
      studentAPI.logProctoringEvent({
        attempt_id: attemptId,
        event_type: 'CAMERA_RECONNECTED',
        details: { timestamp: new Date().toISOString() },
      }).catch(() => {});
    }
  }, [attemptId]);

  // Initialize webcam stream
  const initWebcam = useCallback(async () => {
    if (!enableProctoring || !attemptId || isUnmountedRef.current) return;

    // Clean up any stale tracks first to prevent stream duplication
    stopCameraStream();

    setMonitoringState(ProctoringState.CAMERA_INITIALIZING);
    monitoringStateRef.current = ProctoringState.CAMERA_INITIALIZING;
    setFaceCount(null);
    setCameraStatusMsg('Requesting camera access...');

    try {
      const { stream, cancelled } = await requestManagedCamera({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { max: 15 } },
        audio: false,
      });

      if (cancelled || !stream || isUnmountedRef.current) {
        if (stream) {
          stopMediaStream(stream);
        }
        return;
      }

      streamRef.current = stream;

      // Attach track event listeners for disconnection / mute
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleCameraUnavailable('Camera disconnected or ended');
        };
        videoTrack.onmute = () => {
          handleCameraUnavailable('Camera feed muted or blocked');
        };
        videoTrack.onunmute = () => {
          handleCameraRestored();
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (!isUnmountedRef.current && videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        };
      }

      setIsCameraLive(true);
      setCameraStatusMsg('Live Feed Active');
      setMonitoringState(ProctoringState.CAMERA_ACTIVE_PENDING);
      monitoringStateRef.current = ProctoringState.CAMERA_ACTIVE_PENDING;

      studentAPI.logProctoringEvent({
        attempt_id: attemptId,
        event_type: 'CAMERA_RECONNECTED',
        details: { message: 'Webcam feed established.' },
      }).catch(() => {});
    } catch (err) {
      if (isUnmountedRef.current) return;
      const errMsg = err.name === 'NotAllowedError'
        ? 'Camera permission denied.'
        : 'Camera blocked or unavailable.';
      handleCameraUnavailable(errMsg);
    }
  }, [attemptId, enableProctoring, handleCameraUnavailable, handleCameraRestored, stopCameraStream]);

  // Public reconnect handler for student retry button
  const handleReconnectClick = useCallback(() => {
    initWebcam();
  }, [initWebcam]);

  // Main Effect: Stream setup, Face detector initialization & Window listeners
  useEffect(() => {
    if (!enableProctoring || !attemptId) return;

    isUnmountedRef.current = false;

    // 1. Start Webcam
    initWebcam();

    // 2. Load shared face detector singleton
    let detectorCancelled = false;
    getSharedFaceDetector()
      .then((detector) => {
        if (!detectorCancelled && !isUnmountedRef.current) {
          detectorRef.current = detector;
        }
      })
      .catch((err) => {
        console.warn('Failed to load shared face detector:', err);
        if (!detectorCancelled && !isUnmountedRef.current) {
          setMonitoringState(ProctoringState.DETECTION_FAILED);
          monitoringStateRef.current = ProctoringState.DETECTION_FAILED;
        }
      });

    // 3. Tab Visibility & Fullscreen Listeners
    const handleVisibilityChange = () => {
      if (document.hidden) {
        studentAPI.logProctoringEvent({
          attempt_id: attemptId,
          event_type: 'TAB_BLUR',
          details: { timestamp: new Date().toISOString() },
        }).catch(() => {});

        if (onWarningRef.current) {
          onWarningRef.current({
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

        if (onFullscreenWarningRef.current) onFullscreenWarningRef.current();
        if (onWarningRef.current) {
          onWarningRef.current({
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
      isUnmountedRef.current = true;
      detectorCancelled = true;

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);

      stopCameraStream();
    };
  }, [attemptId, enableProctoring, initWebcam]);

  // Periodic Face Detection Loop (Runs every 500ms)
  useEffect(() => {
    if (!enableProctoring || !attemptId) return;

    const interval = setInterval(() => {
      if (isUnmountedRef.current) return;

      const stream = streamRef.current;
      const video = videoRef.current;
      const detector = detectorRef.current;

      // 1. Strict stream liveness check
      if (!isCameraStreamLive(stream)) {
        if (monitoringStateRef.current !== ProctoringState.CAMERA_UNAVAILABLE &&
            monitoringStateRef.current !== ProctoringState.CAMERA_INITIALIZING) {
          handleCameraUnavailable('Camera stopped or unavailable');
        }
        return;
      }

      // 2. Video element validity check
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        // Video element not ready with frames yet
        if (video && (video.paused || video.ended)) {
          handleCameraUnavailable('Camera paused or ended');
        }
        return;
      }

      // 3. Frozen Frame Detection
      if (video.currentTime === lastVideoTimeRef.current) {
        frozenFrameCountRef.current += 1;
        if (frozenFrameCountRef.current >= 6) { // 3 seconds with zero frame advancement
          handleCameraUnavailable('Camera feed frozen');
          return;
        }
      } else {
        frozenFrameCountRef.current = 0;
        lastVideoTimeRef.current = video.currentTime;
      }

      // 4. Face Detector model readiness check
      if (!detector) {
        if (monitoringStateRef.current !== ProctoringState.CAMERA_ACTIVE_PENDING) {
          setMonitoringState(ProctoringState.CAMERA_ACTIVE_PENDING);
          monitoringStateRef.current = ProctoringState.CAMERA_ACTIVE_PENDING;
        }
        return;
      }

      // 5. Execute face detection on the live video frame
      try {
        const detections = detector.detectForVideo(video, performance.now());
        const count = detections?.detections?.length ?? 0;
        setFaceCount(count);

        const now = Date.now();

        if (count === 1) {
          // Exactly 1 face verified
          setMonitoringState(ProctoringState.ONE_FACE);
          monitoringStateRef.current = ProctoringState.ONE_FACE;
          noFaceDurationRef.current = 0;
          multiFaceDurationRef.current = 0;
          setLastWarningMsg(null);
        } else if (count === 0) {
          // No face detected
          setMonitoringState(ProctoringState.NO_FACE);
          monitoringStateRef.current = ProctoringState.NO_FACE;
          noFaceDurationRef.current += 0.5;
          multiFaceDurationRef.current = 0;

          // Trigger NO_FACE if absent continuously for >= 5s (with 15s cooldown)
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

            if (onWarningRef.current) {
              onWarningRef.current({
                type: 'NO_FACE',
                message: 'No face detected in webcam frame. Please ensure your face is clearly visible.',
              });
            }
          }
        } else {
          // Multiple faces (>1) detected
          setMonitoringState(ProctoringState.MULTIPLE_FACES);
          monitoringStateRef.current = ProctoringState.MULTIPLE_FACES;
          multiFaceDurationRef.current += 0.5;
          noFaceDurationRef.current = 0;

          // Trigger MULTIPLE_FACES if >1 face continuously for >= 3s (with 15s cooldown)
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

            if (onWarningRef.current) {
              onWarningRef.current({
                type: 'MULTIPLE_FACES',
                message: `Multiple faces (${count}) detected in camera. Only the authorized examinee should be present.`,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Face detection inference error:', err);
        setMonitoringState(ProctoringState.DETECTION_FAILED);
        monitoringStateRef.current = ProctoringState.DETECTION_FAILED;
        setFaceCount(null);
      }
    }, 500);

    detectionIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [enableProctoring, attemptId, handleCameraUnavailable]);

  if (!enableProctoring) {
    return (
      <div
        className="card"
        style={{
          padding: '16px',
          textAlign: 'center',
          color: 'var(--gray-500)',
          fontSize: '12px',
          background: 'var(--gray-100)',
          borderRadius: '10px',
        }}
      >
        🔒 Camera closed (Exam completed / inactive)
      </div>
    );
  }

  const currentConfig =
    monitoringState === ProctoringState.MULTIPLE_FACES
      ? STATE_CONFIG[ProctoringState.MULTIPLE_FACES](faceCount || 2)
      : STATE_CONFIG[monitoringState] || STATE_CONFIG[ProctoringState.CAMERA_UNAVAILABLE];

  return (
    <div>
      <div
        className="webcam-tile"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '10px',
          height: '170px',
          background: '#0f172a',
          margin: 0,
        }}
      >
        {/* Continuous video element that is NEVER unmounted to keep MediaStream ref stable */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="webcam-video"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            display: isCameraLive ? 'block' : 'none',
          }}
        />

        {/* Placeholder displayed when camera is not actively streaming */}
        {!isCameraLive && (
          <div
            style={{
              height: '100%',
              width: '100%',
              color: 'var(--gray-400)',
              fontSize: '12px',
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: '#0f172a',
            }}
          >
            <div>{cameraStatusMsg}</div>
            <button
              type="button"
              onClick={handleReconnectClick}
              className="btn btn-secondary"
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: 'rgba(255, 255, 255, 0.12)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                cursor: 'pointer',
              }}
            >
              ↻ Reconnect Camera
            </button>
          </div>
        )}

        {/* Live Top Status Pill with Distinct State Colors & Labels */}
        <div className="webcam-badge" style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 2 }}>
          <span
            className="webcam-indicator-dot"
            style={{
              background: currentConfig.dotColor,
              boxShadow: `0 0 6px ${currentConfig.dotColor}`,
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {currentConfig.label}
          </span>
        </div>

        {/* Bottom Alert Pill if Anomaly Detected */}
        {lastWarningMsg && (
          <div
            style={{
              position: 'absolute',
              bottom: '6px',
              left: '6px',
              right: '6px',
              background: 'rgba(239, 68, 68, 0.95)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: '600',
              padding: '5px 8px',
              borderRadius: '4px',
              textAlign: 'center',
              zIndex: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
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

export const ProctoringBadge = React.memo(ProctoringBadgeComponent);
