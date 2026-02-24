import * as THREE from 'three';
import { HAND } from '../utils/constants.js';

// All 25 joints defined by the WebXR Hand Input spec
const ALL_JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal',
    'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal',
    'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal',
    'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal',
    'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

function makeHandState() {
  return {
    detected:      false,
    pinching:      false,
    pinchPosition: new THREE.Vector3(),
    joints:        new Map(),   // jointName -> { position, quaternion, radius }
  };
}

/**
 * Reads hand joint data from XRFrame and exposes:
 *   - per-joint positions / orientations
 *   - pinch detection (thumb-tip ↔ index-finger-tip distance)
 *   - onPinchStart / onPinchEnd callbacks
 */
export class HandTracking {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene}         scene
   */
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene    = scene;

    this.hands = {
      left:  makeHandState(),
      right: makeHandState(),
    };

    // Set these callbacks from outside (e.g. GrabSystem)
    /** @type {((handKey: string, position: THREE.Vector3) => void) | null} */
    this.onPinchStart = null;
    /** @type {((handKey: string) => void) | null} */
    this.onPinchEnd   = null;

    // Three.js hand objects (spatial anchors — useful for raycasting / helpers)
    this._xrHands = [
      renderer.xr.getHand(0),
      renderer.xr.getHand(1),
    ];
    this._xrHands.forEach((h) => scene.add(h));
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  /**
   * Call every frame inside the animation loop, passing the current XRFrame.
   * @param {XRFrame | null} frame
   */
  update(frame) {
    if (!frame) return;

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return;

    // Track which hands were seen this frame
    const seen = new Set();

    for (const src of frame.session.inputSources) {
      if (!src.hand) continue;

      const key  = src.handedness === 'left' ? 'left' : 'right';
      const data = this.hands[key];
      seen.add(key);
      data.detected = true;

      // ── Read joint poses ────────────────────────────────────────────
      for (const jointName of ALL_JOINTS) {
        const joint = src.hand.get(jointName);
        if (!joint) continue;

        const pose = frame.getJointPose(joint, refSpace);
        if (!pose) continue;

        const { position: p, orientation: o } = pose.transform;

        let jd = data.joints.get(jointName);
        if (!jd) {
          jd = {
            position:   new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            radius:     0.01,
          };
          data.joints.set(jointName, jd);
        }

        jd.position.set(p.x, p.y, p.z);
        jd.quaternion.set(o.x, o.y, o.z, o.w);
        jd.radius = pose.radius ?? 0.01;
      }

      // ── Pinch detection ─────────────────────────────────────────────
      const thumbTip = data.joints.get('thumb-tip');
      const indexTip = data.joints.get('index-finger-tip');

      if (thumbTip && indexTip) {
        const dist       = thumbTip.position.distanceTo(indexTip.position);
        const wasPinching = data.pinching;
        data.pinching    = dist < HAND.PINCH_THRESHOLD;

        // Midpoint of thumb + index tip
        if (data.pinching) {
          data.pinchPosition.addVectors(thumbTip.position, indexTip.position).multiplyScalar(0.5);
        }

        if (!wasPinching && data.pinching)  this.onPinchStart?.(key, data.pinchPosition.clone());
        if ( wasPinching && !data.pinching) this.onPinchEnd?.(key);
      }
    }

    // Mark hands that were not seen in this frame as lost
    for (const key of ['left', 'right']) {
      if (!seen.has(key)) {
        const data = this.hands[key];
        if (data.pinching) this.onPinchEnd?.(key);
        data.detected = false;
        data.pinching = false;
      }
    }
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  isPinching(handKey)    { return this.hands[handKey]?.pinching ?? false; }
  isDetected(handKey)    { return this.hands[handKey]?.detected ?? false; }
  getPinchPosition(handKey) { return this.hands[handKey]?.pinchPosition.clone() ?? new THREE.Vector3(); }

  getJointPosition(handKey, jointName) {
    return this.hands[handKey]?.joints.get(jointName)?.position ?? null;
  }

  /** Returns a summary used by the debug panel. */
  getStatus() {
    return {
      left:  { detected: this.hands.left.detected,  pinching: this.hands.left.pinching  },
      right: { detected: this.hands.right.detected, pinching: this.hands.right.pinching },
    };
  }
}
