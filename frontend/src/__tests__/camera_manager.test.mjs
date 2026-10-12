import assert from 'node:assert';
import {
  registerActiveStream,
  unregisterActiveStream,
  stopStreamTracks,
  stopAllCameraStreams,
  requestManagedCamera,
  cancelPendingCameraSession,
  getActiveStreamCount,
} from '../utils/cameraManager.js';

console.log('--- Testing Centralized Camera Manager Lifecycle & Cleanup ---');

// Mock MediaStreamTrack
function createMockTrack() {
  let isStopped = false;
  let isEnabled = true;
  return {
    kind: 'video',
    get enabled() { return isEnabled; },
    set enabled(val) { isEnabled = val; },
    get readyState() { return isStopped ? 'ended' : 'live'; },
    stop: () => { isStopped = true; isEnabled = false; },
    get isStopped() { return isStopped; },
  };
}

// Mock MediaStream
function createMockStream(tracks = [createMockTrack()]) {
  return {
    active: true,
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
    removeTrack: (t) => {},
  };
}

// Mock HTMLVideoElement
function createMockVideo() {
  let paused = false;
  return {
    srcObject: null,
    pause: () => { paused = true; },
    get isPaused() { return paused; },
  };
}

// 1. Test registration and unregistration
console.log('\n--- Test 1: Register and Unregister Stream ---');
const track1 = createMockTrack();
const stream1 = createMockStream([track1]);
registerActiveStream(stream1);
assert.strictEqual(getActiveStreamCount(), 1, 'Registry should have 1 stream');

unregisterActiveStream(stream1);
assert.strictEqual(getActiveStreamCount(), 0, 'Registry should be empty after unregister');
console.log('✓ Stream register/unregister verified');

// 2. Test stopStreamTracks and video cleanup
console.log('\n--- Test 2: stopStreamTracks with Video Element ---');
const track2 = createMockTrack();
const stream2 = createMockStream([track2]);
const video2 = createMockVideo();
video2.srcObject = stream2;

assert.strictEqual(track2.isStopped, false);
assert.strictEqual(track2.enabled, true);

stopStreamTracks(stream2, video2);

assert.strictEqual(track2.isStopped, true, 'Track stop() must be called');
assert.strictEqual(track2.enabled, false, 'Track enabled must be set to false');
assert.strictEqual(video2.srcObject, null, 'Video element srcObject must be cleared');
assert.strictEqual(video2.isPaused, true, 'Video element must be paused');
console.log('✓ stopStreamTracks stopped track and cleaned video element');

// 3. Test stopAllCameraStreams (Idempotence & Bulk Cleanup)
console.log('\n--- Test 3: stopAllCameraStreams Idempotence & Multi-stream Cleanup ---');
const trackA = createMockTrack();
const streamA = createMockStream([trackA]);
const trackB = createMockTrack();
const streamB = createMockStream([trackB]);

registerActiveStream(streamA);
registerActiveStream(streamB);
assert.strictEqual(getActiveStreamCount(), 2);

// Call stopAllCameraStreams
const stoppedCount1 = stopAllCameraStreams();
assert.strictEqual(stoppedCount1, 2, 'Should report 2 streams stopped');
assert.strictEqual(trackA.isStopped, true);
assert.strictEqual(trackB.isStopped, true);
assert.strictEqual(getActiveStreamCount(), 0, 'Registry must be 0 after stopAllCameraStreams');

// Second call must be idempotent and safe
const stoppedCount2 = stopAllCameraStreams();
assert.strictEqual(stoppedCount2, 0, 'Second call should safely stop 0 streams');
assert.strictEqual(getActiveStreamCount(), 0);
console.log('✓ stopAllCameraStreams is idempotent and safely cleans multiple streams');

// 4. Test requestManagedCamera with cancellation (Simulating React Strict Mode unmount before promise resolve)
console.log('\n--- Test 4: Managed Camera Cancellation (React Strict Mode Safety) ---');
const mockCancelledTrack = createMockTrack();
const mockCancelledStream = createMockStream([mockCancelledTrack]);

// Mock navigator.mediaDevices.getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: async () => {
      // Simulate async delay
      await new Promise(r => setTimeout(r, 10));
      return mockCancelledStream;
    },
  },
  configurable: true,
  writable: true,
});

let callbackFired = false;
const promise = requestManagedCamera({ video: true }, () => {
  callbackFired = true;
});

// Simulate component unmounting while getUserMedia was pending
cancelPendingCameraSession();

const { stream: resultStream, cancelled } = await promise;
assert.strictEqual(cancelled, true, 'Result must be marked cancelled');
assert.strictEqual(resultStream, null, 'Cancelled session must return null stream');
assert.strictEqual(callbackFired, true, 'Cancellation callback must be fired');
assert.strictEqual(mockCancelledTrack.isStopped, true, 'Hardware track must be immediately stopped on cancelled session');
assert.strictEqual(getActiveStreamCount(), 0, 'No orphaned stream left in registry');
console.log('✓ Stale getUserMedia resolution in cancelled session cleans tracks immediately without leakage');

console.log('\n✅ ALL CAMERA MANAGER TESTS PASSED SUCCESSFULLY!\n');
