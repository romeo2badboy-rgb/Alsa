import * as THREE from 'three';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';

/**
 * Manages the THREE.AnimationMixer for a VRM character.
 *
 * Out-of-the-box it creates a procedural idle animation (gentle breathing
 * and weight-shift) so the character animates even without external BVH
 * files. External BVH clips can be loaded and blended in at runtime.
 */
export class AnimationManager {
  constructor() {
    /** @type {import('@pixiv/three-vrm').VRM | null} */
    this.vrm    = null;
    /** @type {THREE.AnimationMixer | null} */
    this.mixer  = null;
    /** @type {THREE.AnimationAction | null} */
    this._currentAction = null;

    this._clips     = new Map();   // name → AnimationClip
    this._bvhLoader = new BVHLoader();
  }

  // ── Initialisation ──────────────────────────────────────────────────────

  /**
   * Attach to a newly-loaded VRM.
   * @param {import('@pixiv/three-vrm').VRM} vrm
   */
  init(vrm) {
    this.vrm   = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);

    this._buildIdleClip();
    this.play('idle');
  }

  // ── Playback ────────────────────────────────────────────────────────────

  /**
   * Cross-fade to a named clip (0.3 s blend).
   * @param {string} name
   */
  play(name) {
    const clip = this._clips.get(name);
    if (!clip || !this.mixer) return;

    const next = this.mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).play();

    if (this._currentAction && this._currentAction !== next) {
      next.crossFadeFrom(this._currentAction, 0.3, true);
    }

    this._currentAction = next;
  }

  /** Must be called every frame with the frame delta (seconds). */
  update(delta) {
    this.mixer?.update(delta);
  }

  // ── BVH loading ─────────────────────────────────────────────────────────

  /**
   * Load a BVH file and store it as a named clip.
   * @param {string} url
   * @param {string} name
   * @returns {Promise<THREE.AnimationClip>}
   */
  loadBVH(url, name) {
    return new Promise((resolve, reject) => {
      this._bvhLoader.load(
        url,
        (result) => {
          const clip = result.clip;
          this._clips.set(name, clip);
          resolve(clip);
        },
        undefined,
        reject,
      );
    });
  }

  get clipNames() {
    return Array.from(this._clips.keys());
  }

  // ── Procedural idle ─────────────────────────────────────────────────────

  _buildIdleClip() {
    const vrm    = this.vrm;
    const tracks = [];
    const dur    = 4.0; // seconds

    // Helper: add a looping QuaternionKeyframeTrack on a normalized bone
    const addBoneRot = (boneName, eulerA, eulerB) => {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName);
      if (!node) return;

      const qA = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eulerA));
      const qB = new THREE.Quaternion().setFromEuler(new THREE.Euler(...eulerB));
      const qC = qA.clone();

      tracks.push(new THREE.QuaternionKeyframeTrack(
        `${node.name}.quaternion`,
        [0, dur / 2, dur],
        [
          qA.x, qA.y, qA.z, qA.w,
          qB.x, qB.y, qB.z, qB.w,
          qC.x, qC.y, qC.z, qC.w,
        ],
      ));
    };

    // Helper: add a looping VectorKeyframeTrack (position)
    const addBonePos = (boneName, posA, posB) => {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName);
      if (!node) return;

      const base = node.position.toArray();
      const a = [base[0] + posA[0], base[1] + posA[1], base[2] + posA[2]];
      const b = [base[0] + posB[0], base[1] + posB[1], base[2] + posB[2]];

      tracks.push(new THREE.VectorKeyframeTrack(
        `${node.name}.position`,
        [0, dur / 2, dur],
        [...a, ...b, ...a],
      ));
    };

    // Gentle breathing: hips rise and fall 5 mm, chest slightly expands
    addBonePos('hips',  [0, 0, 0], [0, 0.005, 0]);
    addBoneRot('chest', [0, 0, 0], [0.012, 0, 0]);

    // Subtle head bob and micro-sway
    addBoneRot('head', [0, 0, 0], [-0.015, 0.008, 0]);
    addBoneRot('neck', [0, 0, 0], [0.01, 0, 0]);

    // Slight weight-shift: hips rotate a hair
    addBoneRot('hips', [0, 0, 0], [0, 0.008, 0.005]);

    // Arms hang naturally
    addBoneRot('leftUpperArm',  [0, 0,  0.08], [0, 0,  0.06]);
    addBoneRot('rightUpperArm', [0, 0, -0.08], [0, 0, -0.06]);

    const clip = new THREE.AnimationClip('idle', dur, tracks);
    clip.loop = THREE.LoopRepeat;
    this._clips.set('idle', clip);
  }
}
