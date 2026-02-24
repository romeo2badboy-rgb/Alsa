import { PHYSICS } from '../utils/constants.js';

/**
 * Thin wrapper around a Rapier World.
 * Accumulates delta time and steps at a fixed rate.
 */
export class PhysicsWorld {
  /** @param {import('@dimforge/rapier3d-compat')} RAPIER */
  constructor(RAPIER) {
    this.RAPIER = RAPIER;

    this.world = new RAPIER.World(
      new RAPIER.Vector3(PHYSICS.GRAVITY.x, PHYSICS.GRAVITY.y, PHYSICS.GRAVITY.z)
    );
    this.world.timestep = PHYSICS.FIXED_STEP;

    this._accumulator = 0;
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  step(delta) {
    this._accumulator += delta;
    let steps = 0;
    while (this._accumulator >= PHYSICS.FIXED_STEP) {
      this.world.step();
      this._accumulator -= PHYSICS.FIXED_STEP;
      if (++steps >= PHYSICS.MAX_STEPS_PER_FRAME) {
        this._accumulator = 0;
        break;
      }
    }
  }

  // ── Factory helpers ─────────────────────────────────────────────────────

  createRigidBody(desc) {
    return this.world.createRigidBody(desc);
  }

  createCollider(desc, body) {
    return this.world.createCollider(desc, body);
  }

  createImpulseJoint(desc, bodyA, bodyB, wakeUp = true) {
    return this.world.createImpulseJoint(desc, bodyA, bodyB, wakeUp);
  }

  // ── Removal ─────────────────────────────────────────────────────────────

  removeRigidBody(body) {
    if (body) this.world.removeRigidBody(body);
  }

  removeImpulseJoint(joint, wakeUp = true) {
    if (joint) this.world.removeImpulseJoint(joint, wakeUp);
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  get bodyCount() {
    return this.world.bodies.len();
  }

  get jointCount() {
    return this.world.impulseJoints.len();
  }

  dispose() {
    this.world.free();
  }
}
