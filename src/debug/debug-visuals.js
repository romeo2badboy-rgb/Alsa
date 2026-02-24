import * as THREE from 'three';
import { DEBUG } from '../utils/constants.js';

/**
 * Manages Three.js wireframe helpers for:
 *   - Ragdoll collider spheres
 *   - SkeletonHelper (bone hierarchy)
 *   - Hand collider spheres (fingertips)
 *
 * All helpers live inside a single `group` added to the scene.
 */
export class DebugVisuals {
  /** @param {import('three').Scene} scene */
  constructor(scene) {
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.name = 'debug-visuals';
    scene.add(this.group);

    this._colliderEntries  = [];  // { mesh, body }
    this._skeletonHelper   = null;
    this._handSpheres      = { left: [], right: [] };

    // Shared geometries / materials
    this._ballGeo  = new THREE.SphereGeometry(1, 8, 6);
    this._colMat   = new THREE.MeshBasicMaterial({
      color: DEBUG.COLLIDER_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    this._handMat  = new THREE.MeshBasicMaterial({
      color: DEBUG.HAND_COLLIDER_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
  }

  // ── Setup helpers ────────────────────────────────────────────────────────

  /** Call once after the ragdoll is built. */
  setupColliderVisuals(ragdoll) {
    this._ragdoll = ragdoll;

    for (const [boneName, { body }] of ragdoll.bodies) {
      const mesh  = new THREE.Mesh(this._ballGeo, this._colMat);
      const r     = ragdoll.getBoneRadius(boneName);
      mesh.scale.setScalar(r);
      mesh.name    = `col-${boneName}`;
      mesh.visible = DEBUG.SHOW_COLLIDERS;
      this.group.add(mesh);
      this._colliderEntries.push({ mesh, body });
    }
  }

  /** Call once after the VRM is loaded. */
  setupSkeletonHelper(vrm) {
    if (this._skeletonHelper) {
      this.group.remove(this._skeletonHelper);
      this._skeletonHelper.dispose();
    }
    this._skeletonHelper = new THREE.SkeletonHelper(vrm.scene);
    this._skeletonHelper.visible = DEBUG.SHOW_SKELETON;
    this.group.add(this._skeletonHelper);
  }

  /** Call once to set up fingertip sphere indicators. */
  setupHandVisuals() {
    const FINGERTIPS = [
      'thumb-tip', 'index-finger-tip', 'middle-finger-tip',
      'ring-finger-tip', 'pinky-finger-tip',
    ];

    for (const key of ['left', 'right']) {
      for (let i = 0; i < FINGERTIPS.length; i++) {
        const mesh = new THREE.Mesh(this._ballGeo, this._handMat);
        mesh.scale.setScalar(0.008);
        mesh.visible = false;
        this.group.add(mesh);
        this._handSpheres[key].push({ mesh, jointName: FINGERTIPS[i] });
      }
    }
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  setShowColliders(show) {
    for (const { mesh } of this._colliderEntries) mesh.visible = show;
  }

  setShowSkeleton(show) {
    if (this._skeletonHelper) this._skeletonHelper.visible = show;
  }

  setShowHandColliders(show, handTracking) {
    this._handTracking    = handTracking;
    this._showHandSpheres = show;
    for (const key of ['left', 'right']) {
      for (const { mesh } of this._handSpheres[key]) mesh.visible = show;
    }
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update() {
    // Sync ragdoll collider spheres
    for (const { mesh, body } of this._colliderEntries) {
      if (!mesh.visible) continue;
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    // Sync hand fingertip spheres
    if (this._showHandSpheres && this._handTracking) {
      for (const key of ['left', 'right']) {
        for (const { mesh, jointName } of this._handSpheres[key]) {
          const pos = this._handTracking.getJointPosition(key, jointName);
          if (pos) {
            mesh.visible = true;
            mesh.position.copy(pos);
          } else {
            mesh.visible = false;
          }
        }
      }
    }
  }

  dispose() {
    this._skeletonHelper?.dispose();
    this._ballGeo.dispose();
    this._colMat.dispose();
    this._handMat.dispose();
    this.scene.remove(this.group);
  }
}
