// ── Physics ─────────────────────────────────────────────────────────────────
export const PHYSICS = {
  GRAVITY: { x: 0, y: -9.81, z: 0 },
  FIXED_STEP: 1 / 60,
  MAX_STEPS_PER_FRAME: 3,

  // Ragdoll joint spring parameters
  JOINT_STIFFNESS: 60,
  JOINT_DAMPING: 8,

  // PD controller for force-based grabbing
  GRAB_KP: 800,   // proportional gain (spring)
  GRAB_KD: 60,    // derivative gain  (damper)

  // Rigid body damping
  LINEAR_DAMPING: 0.4,
  ANGULAR_DAMPING: 0.6,
};

// ── Ragdoll ──────────────────────────────────────────────────────────────────
export const RAGDOLL = {
  GRAB_DISTANCE: 0.18,     // metres — max distance for a grab to register
  BONE_COLLIDER_SCALE: 1,
};

// ── Hand tracking ────────────────────────────────────────────────────────────
export const HAND = {
  PINCH_THRESHOLD: 0.025,  // metres — thumb-to-index distance that triggers pinch
  COLLIDER_RADIUS: 0.012,
};

// ── Scene colours ────────────────────────────────────────────────────────────
export const COLORS = {
  BACKGROUND: 0x808080,
  AMBIENT: 0xffffff,
  KEY_LIGHT: 0xfff4e8,
  FILL_LIGHT: 0x8890ff,
  BACK_LIGHT: 0xffffff,
};

// ── Debug ────────────────────────────────────────────────────────────────────
export const DEBUG = {
  SHOW_COLLIDERS: false,
  SHOW_SKELETON: false,
  COLLIDER_COLOR: 0x00ff88,
  JOINT_COLOR: 0xff4444,
  HAND_COLLIDER_COLOR: 0xffee00,
  SPRING_BONE_COLOR: 0x44aaff,
};

// ── VRM humanoid bone names used for the ragdoll (VRM 1.0 camelCase) ─────────
export const RAGDOLL_BONES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];

// Parent → child joint pairs
export const RAGDOLL_JOINTS = [
  ['hips',       'spine'],
  ['spine',      'chest'],
  ['chest',      'upperChest'],
  ['upperChest', 'neck'],
  ['neck',       'head'],
  ['upperChest', 'leftUpperArm'],
  ['leftUpperArm',  'leftLowerArm'],
  ['leftLowerArm',  'leftHand'],
  ['upperChest', 'rightUpperArm'],
  ['rightUpperArm', 'rightLowerArm'],
  ['rightLowerArm', 'rightHand'],
  ['hips',       'leftUpperLeg'],
  ['leftUpperLeg',  'leftLowerLeg'],
  ['leftLowerLeg',  'leftFoot'],
  ['hips',       'rightUpperLeg'],
  ['rightUpperLeg', 'rightLowerLeg'],
  ['rightLowerLeg', 'rightFoot'],
];
