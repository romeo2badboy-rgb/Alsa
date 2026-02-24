import * as THREE from 'three';
import { PHYSICS } from '../utils/constants.js';

/**
 * Force-based grab system using a PD (proportional-derivative) controller.
 *
 * When a pinch is detected near a ragdoll bone, we:
 *   1. Create a kinematic "anchor" rigid body at the pinch position.
 *   2. Each frame, apply a spring-damper force on the grabbed body
 *      to pull it toward the anchor (which tracks the hand).
 *   3. On release, remove the anchor — physics takes over.
 *
 * This avoids Rapier joint API fragility and gives naturally springy grabbing.
 */
export class GrabSystem {
  /**
   * @param {import('./ragdoll').Ragdoll}                          ragdoll
   * @param {import('../xr/hand-tracking').HandTracking}           handTracking
   * @param {import('../physics/physics-world').PhysicsWorld}      physicsWorld
   * @param {*} RAPIER
   */
  constructor(ragdoll, handTracking, physicsWorld, RAPIER) {
    this.ragdoll      = ragdoll;
    this.handTracking = handTracking;
    this.physicsWorld = physicsWorld;
    this.RAPIER       = RAPIER;

    // handKey → { boneName, body, anchor (kinematic body) }
    this._grabs = new Map();

    // Temp vectors
    this._tPos  = new THREE.Vector3();
    this._tVel  = new THREE.Vector3();
    this._tForce = new THREE.Vector3();

    // Hook into HandTracking callbacks
    handTracking.onPinchStart = (key, pos) => this._onPinchStart(key, pos);
    handTracking.onPinchEnd   = (key)      => this._onPinchEnd(key);
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  update() {
    for (const [key, grab] of this._grabs) {
      if (!this.handTracking.isPinching(key)) {
        // Safety: clean up if pinch ended without a callback
        this._onPinchEnd(key);
        continue;
      }

      // Move kinematic anchor to current hand position
      const handPos = this.handTracking.getPinchPosition(key);
      grab.anchor.setNextKinematicTranslation({ x: handPos.x, y: handPos.y, z: handPos.z });

      // PD controller: apply force on the grabbed body toward the anchor
      const at = grab.anchor.translation();
      const bt = grab.body.translation();
      const bv = grab.body.linvel();

      const ex = at.x - bt.x;
      const ey = at.y - bt.y;
      const ez = at.z - bt.z;

      const fx = ex * PHYSICS.GRAB_KP - bv.x * PHYSICS.GRAB_KD;
      const fy = ey * PHYSICS.GRAB_KP - bv.y * PHYSICS.GRAB_KD;
      const fz = ez * PHYSICS.GRAB_KP - bv.z * PHYSICS.GRAB_KD;

      grab.body.addForce({ x: fx, y: fy, z: fz }, true);
    }
  }

  // ── State queries ────────────────────────────────────────────────────────

  /** Returns { left?: { boneName }, right?: { boneName } } */
  getGrabState() {
    const out = {};
    for (const [key, grab] of this._grabs) {
      out[key] = { boneName: grab.boneName };
    }
    return out;
  }

  // ── Callbacks ────────────────────────────────────────────────────────────

  _onPinchStart(key, position) {
    if (this._grabs.has(key)) return;  // already grabbing

    const hit = this.ragdoll.getNearestBody(position);
    if (!hit) return;                  // nothing close enough

    const R = this.RAPIER;

    // Kinematic body tracks the hand
    const anchorDesc = R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    const anchor = this.physicsWorld.createRigidBody(anchorDesc);

    // Tiny sensor collider so Rapier registers it (no physical response)
    const colDesc = R.ColliderDesc.ball(0.005).setSensor(true);
    this.physicsWorld.createCollider(colDesc, anchor);

    this._grabs.set(key, {
      boneName: hit.boneName,
      body:     hit.body,
      anchor,
    });

    console.info(`[GrabSystem] ${key} grabbed '${hit.boneName}' (dist ${hit.distance.toFixed(3)} m)`);
  }

  _onPinchEnd(key) {
    const grab = this._grabs.get(key);
    if (!grab) return;

    this.physicsWorld.removeRigidBody(grab.anchor);
    this._grabs.delete(key);

    console.info(`[GrabSystem] ${key} released '${grab.boneName}'`);
  }

  /**
   * Hot-swap the active hand tracking source (WebXR ↔ MediaPipe camera).
   * Wires this grab system's pinch callbacks onto the new source and uses
   * it for position queries during update().
   * @param {import('../xr/hand-tracking').HandTracking | import('../xr/mediapipe-hands').MediaPipeHands} source
   */
  setHandSource(source) {
    source.onPinchStart = (key, pos) => this._onPinchStart(key, pos);
    source.onPinchEnd   = (key)      => this._onPinchEnd(key);
    this.handTracking   = source;
  }

  dispose() {
    for (const key of [...this._grabs.keys()]) this._onPinchEnd(key);
  }
}
