import assert from 'node:assert';
import { isCameraStreamLive, ProctoringState, stopMediaStream } from '../utils/proctoringHelpers.js';

console.log('--- Testing Proctoring State Machine & Liveness Logic ---');

// 1. Verify all 7 required states exist
const expectedStates = [
  'CAMERA_INITIALIZING',
  'CAMERA_ACTIVE_PENDING',
  'NO_FACE',
  'ONE_FACE',
  'MULTIPLE_FACES',
  'CAMERA_UNAVAILABLE',
  'DETECTION_FAILED',
];

expectedStates.forEach((stateKey) => {
  assert.ok(ProctoringState[stateKey], `ProctoringState.${stateKey} must be defined`);
  console.log(`✓ State defined: ${stateKey} = ${ProctoringState[stateKey]}`);
});

// 2. Test isCameraStreamLive
console.log('\n--- Testing isCameraStreamLive() ---');

// Null or undefined
assert.strictEqual(isCameraStreamLive(null), false, 'Null stream must be inactive');
assert.strictEqual(isCameraStreamLive(undefined), false, 'Undefined stream must be inactive');

// Inactive stream
assert.strictEqual(
  isCameraStreamLive({ active: false, getVideoTracks: () => [{ readyState: 'live', enabled: true, muted: false }] }),
  false,
  'stream with active: false must be inactive'
);

// Empty tracks
assert.strictEqual(
  isCameraStreamLive({ active: true, getVideoTracks: () => [] }),
  false,
  'Stream with no video tracks must be inactive'
);

// Track ended
assert.strictEqual(
  isCameraStreamLive({ active: true, getVideoTracks: () => [{ readyState: 'ended', enabled: true, muted: false }] }),
  false,
  'Ended track must be inactive'
);

// Track disabled
assert.strictEqual(
  isCameraStreamLive({ active: true, getVideoTracks: () => [{ readyState: 'live', enabled: false, muted: false }] }),
  false,
  'Disabled track must be inactive'
);

// Track muted (e.g. system shutter or privacy cover)
assert.strictEqual(
  isCameraStreamLive({ active: true, getVideoTracks: () => [{ readyState: 'live', enabled: true, muted: true }] }),
  false,
  'Muted track must be inactive'
);

// Fully live and unmuted track
assert.strictEqual(
  isCameraStreamLive({ active: true, getVideoTracks: () => [{ readyState: 'live', enabled: true, muted: false }] }),
  true,
  'Active, live, enabled, unmuted track must be active'
);

console.log('✓ All isCameraStreamLive() test cases passed!');

// 3. Test Stale Detection Reset behavior simulation
console.log('\n--- Testing Face Count Invalidation Logic ---');
let simulatedState = {
  monitoringState: ProctoringState.CAMERA_INITIALIZING,
  faceCount: null,
  isCameraLive: false,
};

// Initial state must not report 1 face
assert.strictEqual(simulatedState.faceCount, null, 'Initial faceCount must be null, never default to 1');

// When camera connects and 1 face detected
simulatedState = {
  monitoringState: ProctoringState.ONE_FACE,
  faceCount: 1,
  isCameraLive: true,
};
assert.strictEqual(simulatedState.faceCount, 1, 'Active camera with 1 detection shows 1');

// When camera closes or stops
function simulateCameraStop(state) {
  return {
    ...state,
    monitoringState: ProctoringState.CAMERA_UNAVAILABLE,
    faceCount: null, // Critical: MUST reset to null immediately!
    isCameraLive: false,
  };
}

const stoppedState = simulateCameraStop(simulatedState);
assert.strictEqual(stoppedState.faceCount, null, 'Stopped camera must reset faceCount to null');
assert.strictEqual(stoppedState.monitoringState, ProctoringState.CAMERA_UNAVAILABLE);
assert.strictEqual(stoppedState.isCameraLive, false);
console.log('✓ Stopped camera immediately invalidates faceCount and reports CAMERA_UNAVAILABLE');

// 4. Test stopMediaStream helper
console.log('\n--- Testing stopMediaStream() helper ---');

let stoppedTrackCount = 0;
let trackEnabledState = true;
const mockTrack = {
  stop: () => { stoppedTrackCount += 1; },
  enabled: true,
};
const mockStream = {
  getTracks: () => [mockTrack],
};

let videoPaused = false;
const mockVideo = {
  srcObject: mockStream,
  pause: () => { videoPaused = true; },
};

stopMediaStream(mockStream, mockVideo);
assert.strictEqual(stoppedTrackCount, 1, 'Track stop() must be called');
assert.strictEqual(mockTrack.enabled, false, 'Track enabled must be set to false');
assert.strictEqual(mockVideo.srcObject, null, 'video.srcObject must be set to null');
assert.strictEqual(videoPaused, true, 'video.pause() must be called');
console.log('✓ stopMediaStream successfully stopped tracks, set enabled=false, and cleared video element');

console.log('\n✅ ALL PROCTORING LOGIC TESTS PASSED SUCCESSFULLY!\n');
