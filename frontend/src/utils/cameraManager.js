/**
 * cameraManager.js
 * 
 * Centralized, leak-proof camera lifecycle controller.
 * Solves React Strict Mode duplicate stream acquisition, in-flight cancellation,
 * and ensures all MediaStreamTracks are immediately stopped upon submission, expiry,
 * unmounting, or navigation.
 */

// Global registry of all active media streams created in the application
const activeStreams = new Set();

// Active camera session token to invalidate in-flight getUserMedia promises
let currentSessionToken = 0;

/**
 * Checks whether a MediaStream is active, valid, and has a live unmuted video track.
 */
export function isStreamLive(stream) {
  if (!stream || !stream.active) return false;
  const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
  if (!tracks || tracks.length === 0) return false;
  const track = tracks[0];
  return track.readyState === 'live' && track.enabled === true && !track.muted;
}

/**
 * Stop every track on a given MediaStream and optionally release a video element.
 * Idempotent and safe against null/undefined.
 */
export function stopStreamTracks(stream, videoElement = null) {
  if (stream) {
    try {
      const tracks = stream.getTracks ? stream.getTracks() : [];
      tracks.forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {
          // Safe ignore on already stopped tracks
        }
      });
    } catch {
      // Safe ignore
    }
    activeStreams.delete(stream);
  }
  if (videoElement) {
    releaseVideoElement(videoElement);
  }
}

export function registerActiveStream(stream) {
  if (stream) activeStreams.add(stream);
}

export function unregisterActiveStream(stream) {
  if (stream) activeStreams.delete(stream);
}

/**
 * Completely clears a video element's stream and releases hardware resources.
 */
export function releaseVideoElement(videoElement) {
  if (!videoElement) return;
  try {
    if (videoElement.srcObject) {
      stopStreamTracks(videoElement.srcObject);
      videoElement.srcObject = null;
    }
    if (typeof videoElement.pause === 'function') {
      videoElement.pause();
    }
  } catch {
    // Safe ignore
  }
}

/**
 * Request camera access with strict lifecycle and session management.
 * If this request is cancelled (e.g. Strict Mode unmount/remount) or superseded
 * while the browser prompt or hardware is initializing, any returned stream
 * is immediately stopped before it can leak.
 *
 * @param {MediaStreamConstraints} constraints
 * @param {Function} onSessionCancelled Callback if cancelled before resolution
 * @returns {Promise<{ stream: MediaStream | null, sessionId: number }>}
 */
export async function requestManagedCamera(constraints, onSessionCancelled = null) {
  currentSessionToken += 1;
  const sessionId = currentSessionToken;

  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Webcam media devices are not supported in this browser.');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // If session was superseded or cancelled while awaiting getUserMedia
    if (sessionId !== currentSessionToken) {
      // Immediately terminate the orphaned stream
      stopStreamTracks(stream);
      if (onSessionCancelled) onSessionCancelled();
      return { stream: null, sessionId, cancelled: true };
    }

    // Register stream in active set
    activeStreams.add(stream);

    // Attach native track ended listener as safety net
    try {
      const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
      tracks.forEach((t) => {
        const originalOnEnded = t.onended;
        t.onended = (e) => {
          activeStreams.delete(stream);
          if (typeof originalOnEnded === 'function') originalOnEnded(e);
        };
      });
    } catch {
      // Ignored
    }

    return { stream, sessionId, cancelled: false };
  } catch (err) {
    if (sessionId !== currentSessionToken) {
      return { stream: null, sessionId, cancelled: true };
    }
    throw err;
  }
}

/**
 * Cancels any pending camera acquisition session.
 */
export function cancelPendingCameraSession() {
  currentSessionToken += 1;
}

/**
 * Stops ALL camera streams and tracks application-wide.
 * Idempotent: can be safely invoked multiple times.
 *
 * @param {HTMLVideoElement | null} videoElement Optional video element to detach
 */
export function stopAllCameraStreams(videoElement = null) {
  // 1. Invalidate any in-flight getUserMedia requests
  cancelPendingCameraSession();

  // 2. Detach and stop video element stream if provided
  if (videoElement) {
    releaseVideoElement(videoElement);
  }

  // 3. Stop every registered active stream
  const count = activeStreams.size;
  activeStreams.forEach((stream) => {
    stopStreamTracks(stream);
  });
  activeStreams.clear();
  return count;
}

/**
 * Get count of currently tracked active media streams (useful for testing/telemetry).
 */
export function getActiveStreamsCount() {
  return activeStreams.size;
}
export const getActiveStreamCount = getActiveStreamsCount;

// Global safety hook for emergency cleanup (e.g. navigation / unhandled rejections)
if (typeof window !== 'undefined') {
  window.__stopAllExamCameras = stopAllCameraStreams;
}
