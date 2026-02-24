import * as THREE from 'three';

// ── Rapier ↔ Three.js conversions ─────────────────────────────────────────

export function rapierVec3ToThree(rv, out = new THREE.Vector3()) {
  return out.set(rv.x, rv.y, rv.z);
}

export function rapierQuatToThree(rq, out = new THREE.Quaternion()) {
  return out.set(rq.x, rq.y, rq.z, rq.w);
}

export function threeVec3ToRapier(RAPIER, v) {
  return new RAPIER.Vector3(v.x, v.y, v.z);
}

export function threeQuatToRapier(RAPIER, q) {
  return new RAPIER.Quaternion(q.x, q.y, q.z, q.w);
}

// ── Bone helpers ──────────────────────────────────────────────────────────

export function boneWorldPos(bone, out = new THREE.Vector3()) {
  bone.getWorldPosition(out);
  return out;
}

export function boneWorldQuat(bone, out = new THREE.Quaternion()) {
  bone.getWorldQuaternion(out);
  return out;
}

/**
 * Write a desired world-space position + quaternion into a bone's local
 * transform, correctly accounting for the parent's current world matrix.
 */
export function setBoneWorldTransform(bone, worldPos, worldQuat) {
  if (!bone.parent) {
    bone.position.copy(worldPos);
    bone.quaternion.copy(worldQuat);
    bone.updateMatrix();
    return;
  }

  bone.parent.updateWorldMatrix(true, false);

  const parentInv = _m4.copy(bone.parent.matrixWorld).invert();
  const worldMat  = _m4b.compose(worldPos, worldQuat, _oneVec);
  const localMat  = parentInv.multiply(worldMat);

  localMat.decompose(bone.position, bone.quaternion, _scaleOut);
  bone.updateMatrix();
  bone.updateWorldMatrix(false, false);
}

// Reusable temporaries (module-level, not exported — internal use only)
const _m4       = new THREE.Matrix4();
const _m4b      = new THREE.Matrix4();
const _oneVec   = new THREE.Vector3(1, 1, 1);
const _scaleOut = new THREE.Vector3();

// ── Number utils ──────────────────────────────────────────────────────────

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ── Formatting ────────────────────────────────────────────────────────────

export function formatBytes(bytes) {
  if (bytes == null) return 'N/A';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatNum(n) {
  return typeof n === 'number' ? n.toLocaleString() : '—';
}
