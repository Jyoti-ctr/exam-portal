/**
 * Proctoring States and Stream Liveness Helpers
 */

export const ProctoringState = {
  CAMERA_INITIALIZING: 'CAMERA_INITIALIZING',
  CAMERA_ACTIVE_PENDING: 'CAMERA_ACTIVE_PENDING',
  NO_FACE: 'NO_FACE',
  ONE_FACE: 'ONE_FACE',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  CAMERA_UNAVAILABLE: 'CAMERA_UNAVAILABLE',
  DETECTION_FAILED: 'DETECTION_FAILED',
};

export const STATE_CONFIG = {
  [ProctoringState.CAMERA_INITIALIZING]: {
    label: 'Camera initializing...',
    dotColor: '#f59e0b',
  },
  [ProctoringState.CAMERA_ACTIVE_PENDING]: {
    label: 'Camera active, detection pending',
    dotColor: '#3b82f6',
  },
  [ProctoringState.NO_FACE]: {
    label: 'No face detected',
    dotColor: '#f59e0b',
  },
  [ProctoringState.ONE_FACE]: {
    label: '1 face verified',
    dotColor: '#22c55e',
  },
  [ProctoringState.MULTIPLE_FACES]: (count) => ({
    label: `${count} faces detected`,
    dotColor: '#ef4444',
  }),
  [ProctoringState.CAMERA_UNAVAILABLE]: {
    label: 'Camera stopped or unavailable',
    dotColor: '#ef4444',
  },
  [ProctoringState.DETECTION_FAILED]: {
    label: 'Face detection failed',
    dotColor: '#f97316',
  },
};

/**
 * Checks whether a MediaStream is active, valid, and has a live unmuted video track.
 */
export function isCameraStreamLive(stream) {
  if (!stream || !stream.active) return false;
  const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
  if (!tracks || tracks.length === 0) return false;
  const track = tracks[0];
  return track.readyState === 'live' && track.enabled === true && !track.muted;
}

/**
 * Completely stops all tracks of a stream and releases the video element.
 */
export function stopMediaStream(stream, videoElement = null) {
  if (stream) {
    try {
      const tracks = stream.getTracks ? stream.getTracks() : [];
      tracks.forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
    } catch {}
  }

  if (videoElement) {
    try {
      if (videoElement.srcObject && videoElement.srcObject !== stream) {
        const vTracks = videoElement.srcObject.getTracks ? videoElement.srcObject.getTracks() : [];
        vTracks.forEach((t) => {
          try {
            t.stop();
            t.enabled = false;
          } catch {}
        });
      }
      videoElement.srcObject = null;
      videoElement.pause();
    } catch {}
  }
}

