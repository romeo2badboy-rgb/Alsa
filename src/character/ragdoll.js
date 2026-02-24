import * as THREE from 'three';
import { PHYSICS, RAGDOLL_BONES, RAGDOLL_JOINTS, RAGDOLL } from '../utils/constants.js';
import { setBoneWorldTransform } from '../utils/helpers.js';

// Bone-size table (metres, approximate)
const BONE_RADIUS = {
  head:         0.10,
  neck:         0.04,
  hips:         0.08,
  spine:        0.06,
  chest:        0.07,
  upperChest:   0.07,
  leftUpperArm: 0.035,  rightUpperArm: 0.035,
  leftLowerArm: 0.03,   rightLowerArm: 0.03,
  leftHand:     0.03,   rightHand:     0.03,
  leftUpperLeg: 0.045,  rightUpperLeg: 0.045,
  leftLowerLeg: 0.035,  rightLowerLeg: 0.035,
  leftFoot:     0.03,   rightFoot:     0.03,
};

// Bone-mass table (kg, approximate)
const BONE_MASS = {
  hips:         6,
  spine:        4,
  chest:        5,   upperChest:   4,
  neck:         1,   head:         3,
  leftUpperArm: 2,   rightUpperArm: 2,
  leftLowerArm: 1.5, rightLowerArm: 1.5,
  leftHand:     0.5, rightHand:     0.5,
  leftUpperLeg: 4,   rightUpperLeg: 4,
  leftLowerLeg: 3,   rightLowerLeg: 3,
  leftFoot:     1,   rightFoot:     1,
};

/**
 * Builds a Rapier ragdoll from a VRM's humanoid bone hierarchy.
 *
 * Each major bone gets a dynamic RigidBody + sphere collider.
 * Adjacent bones are linked with SphericalImpulseJoints.
 * Every frame `syncToVRM()` must be called to write the physics transforms
 * back to the VRM scene graph.
 */
export class Ragdoll {
  /**
   * @param {import('@pixiv/three-vrm').VRM}  vrm
   * @param {import('../physics/physics-world').PhysicsWorld} physicsWorld
   * @param {*} RAPIER
   */
  constructor(vrm, physicsWorld, RAPIER) {
    this.vrm          = vrm;
    this.physicsWorld = physicsWorld;
    this.RAPIER       = RAPIER;

    /** boneName → { body, collider, bone } */
    this.bodies = new Map();
    /** list of Rapier ImpulseJoint handles */
    this.joints = [];

    this.enabled = true;   // set false to freeze ragdoll (e.g. during grab recovery)

    this._tmpPos  = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();

    this._build();
  }

  // ── Build ────────────────────────────────────────────────────────────────

  _build() {
    const R = this.RAPIER;

    for (const boneName of RAGDOLL_BONES) {
      const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName);
      if (!bone) {
        console.warn(`[Ragdoll] bone not found: ${boneName}`);
        continue;
      }

      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      bone.getWorldPosition(wp);
      bone.getWorldQuaternion(wq);

      const radius = BONE_RADIUS[boneName] ?? 0.04;
      const mass   = BONE_MASS[boneName]   ?? 1.0;

      // Dynamic rigid body
      const bodyDesc = R.RigidBodyDesc.dynamic()
        .setTranslation(wp.x, wp.y, wp.z)
        .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w })
        .setLinearDamping(PHYSICS.LINEAR_DAMPING)
        .setAngularDamping(PHYSICS.ANGULAR_DAMPING);

      const body = this.physicsWorld.createRigidBody(bodyDesc);

      const colDesc = R.ColliderDesc.ball(radius)
        .setRestitution(0.2)
        .setFriction(0.5)
        .setMass(mass);

      const collider = this.physicsWorld.createCollider(colDesc, body);

      this.bodies.set(boneName, { body, collider, bone, radius });
    }

    this._buildJoints();
  }

  _buildJoints() {
    const R = this.RAPIER;

    for (const [parentName, childName] of RAGDOLL_JOINTS) {
      const p = this.bodies.get(parentName);
      const c = this.bodies.get(childName);
      if (!p || !c) continue;

      // Anchor = child body origin expressed in parent body local space
      const pt = p.body.translation();
      const ct = c.body.translation();
      const anchorInParent = {
        x: ct.x - pt.x,
        y: ct.y - pt.y,
        z: ct.z - pt.z,
      };
      const anchorInChild = { x: 0, y: 0, z: 0 };

      const jDesc = R.JointData.spherical(anchorInParent, anchorInChild);
      const joint = this.physicsWorld.createImpulseJoint(jDesc, p.body, c.body, true);
      this.joints.push(joint);
    }
  }

  // ── Per-frame sync ───────────────────────────────────────────────────────

  /**
   * Write each rigid body's current world transform back to the corresponding
   * VRM humanoid bone.  Must be called after physics.step() and before vrm.update().
   */
  syncToVRM() {
    if (!this.enabled) return;

    // Process in hierarchical order so parent world matrices are fresh
    for (const boneName of RAGDOLL_BONES) {
      const entry = this.bodies.get(boneName);
      if (!entry) continue;

      const { body, bone } = entry;
      const t = body.translation();
      const r = body.rotation();

      this._tmpPos.set(t.x, t.y, t.z);
      this._tmpQuat.set(r.x, r.y, r.z, r.w);

      setBoneWorldTransform(bone, this._tmpPos, this._tmpQuat);
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * Find the ragdoll body closest to `worldPosition` within `maxDist` metres.
   * @param {THREE.Vector3} worldPosition
   * @param {number}        [maxDist]
   * @returns {{ boneName: string, body: *, distance: number } | null}
   */
  getNearestBody(worldPosition, maxDist = RAGDOLL.GRAB_DISTANCE) {
    let best     = null;
    let bestDist = maxDist;

    for (const [boneName, { body }] of this.bodies) {
      const t  = body.translation();
      const dx = t.x - worldPosition.x;
      const dy = t.y - worldPosition.y;
      const dz = t.z - worldPosition.z;
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (d < bestDist) {
        bestDist = d;
        best     = { boneName, body, distance: d };
      }
    }

    return best;
  }

  getBody(boneName) {
    return this.bodies.get(boneName)?.body ?? null;
  }

  getBoneRadius(boneName) {
    return this.bodies.get(boneName)?.radius ?? 0.04;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  dispose() {
    for (const j of this.joints)       this.physicsWorld.removeImpulseJoint(j);
    for (const [, { body }] of this.bodies) this.physicsWorld.removeRigidBody(body);
    this.joints = [];
    this.bodies.clear();
  }
}
