import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * Loads a VRM file and adds it to the scene.
 * Uses @pixiv/three-vrm for VRM 0.x / 1.0 support.
 */
export class VRMLoader {
  /** @param {import('three').Scene} scene */
  constructor(scene) {
    this.scene      = scene;
    this.currentVRM = null;

    this._loader = new GLTFLoader();
    this._loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  // ── Public ──────────────────────────────────────────────────────────────

  /**
   * Load a VRM from `url`.  Replaces any previously loaded VRM.
   * @param {string}                        url
   * @param {(e: ProgressEvent) => void}   [onProgress]
   * @returns {Promise<import('@pixiv/three-vrm').VRM>}
   */
  load(url, onProgress) {
    return new Promise((resolve, reject) => {
      this._loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) {
            reject(new Error('GLTF file does not contain VRM metadata.'));
            return;
          }

          // Normalise VRM 0.x orientation so it faces +Z (same as VRM 1.0)
          VRMUtils.rotateVRM0(vrm);

          // Dispose old model
          if (this.currentVRM) {
            this.scene.remove(this.currentVRM.scene);
            VRMUtils.deepDispose(this.currentVRM.scene);
          }

          this.currentVRM = vrm;
          this.scene.add(vrm.scene);

          // Default spawn position: standing, centred, facing the camera
          vrm.scene.position.set(0, 0, -1.5);

          console.info('[VRMLoader] Loaded:', url);
          resolve(vrm);
        },
        onProgress,
        (err) => reject(err),
      );
    });
  }

  /**
   * Remove and dispose the currently loaded VRM.
   */
  dispose() {
    if (!this.currentVRM) return;
    this.scene.remove(this.currentVRM.scene);
    VRMUtils.deepDispose(this.currentVRM.scene);
    this.currentVRM = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Return the world-space position of a humanoid bone, or null.
   * @param {import('@pixiv/three-vrm').VRM} vrm
   * @param {string} boneName – VRM 1.0 camelCase name
   */
  static getBoneWorldPos(vrm, boneName) {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!node) return null;
    const v = new THREE.Vector3();
    node.getWorldPosition(v);
    return v;
  }
}
