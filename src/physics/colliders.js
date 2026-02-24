/**
 * Collider descriptor factory helpers.
 * All return a ColliderDesc — caller is responsible for calling
 * world.createCollider(desc, body).
 */

export function ballDesc(RAPIER, radius, { restitution = 0.2, friction = 0.6, mass = 1 } = {}) {
  return RAPIER.ColliderDesc.ball(radius)
    .setRestitution(restitution)
    .setFriction(friction)
    .setMass(mass);
}

export function capsuleDesc(RAPIER, halfHeight, radius, opts = {}) {
  const { restitution = 0.2, friction = 0.6, mass = 1 } = opts;
  return RAPIER.ColliderDesc.capsule(halfHeight, radius)
    .setRestitution(restitution)
    .setFriction(friction)
    .setMass(mass);
}

export function cuboidDesc(RAPIER, hx, hy, hz, opts = {}) {
  const { restitution = 0.2, friction = 0.6, mass = 1 } = opts;
  return RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setRestitution(restitution)
    .setFriction(friction)
    .setMass(mass);
}
