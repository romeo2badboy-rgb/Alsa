import * as THREE from 'three';

/**
 * Smooth joystick locomotion.
 *
 * Left thumbstick → translate the camera rig in the camera's horizontal plane.
 * The camera rig is a THREE.Group that wraps the camera; move it to move the player.
 */
export class Locomotion {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Group}         cameraRig  – parent group of the camera
   */
  constructor(renderer, cameraRig) {
    this.renderer   = renderer;
    this.cameraRig  = cameraRig;
    this.speed      = 2.5; // m/s

    this._fwd   = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move  = new THREE.Vector3();
  }

  /**
   * Call each frame inside the animation loop.
   * @param {number}   delta
   * @param {XRFrame|null} frame
   */
  update(delta, frame) {
    if (!frame) return;

    for (const src of frame.session.inputSources) {
      if (!src.gamepad) continue;
      const { axes, handedness } = src.gamepad;

      // Left stick only (handedness === 'left'), axes[2] = x, axes[3] = y
      if (handedness !== 'left' || axes.length < 4) continue;

      const stickX = axes[2];
      const stickZ = axes[3];
      if (Math.abs(stickX) < 0.12 && Math.abs(stickZ) < 0.12) continue;

      // Derive camera forward / right from the XR camera yaw
      const xrCam = this.renderer.xr.getCamera();
      xrCam.getWorldDirection(this._fwd);
      this._fwd.y = 0;
      this._fwd.normalize();

      this._right.crossVectors(this._fwd, new THREE.Vector3(0, 1, 0)).normalize();

      this._move.set(0, 0, 0)
        .addScaledVector(this._fwd,  -stickZ * this.speed * delta)
        .addScaledVector(this._right, stickX * this.speed * delta);

      this.cameraRig.position.add(this._move);
    }
  }
}
