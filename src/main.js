/**
 * ALFA — VR Interactive Character
 * Entry point: bootstraps the Three.js scene, WebXR session, physics,
 * VRM character, debug system, and wires them together in the render loop.
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { PhysicsWorld }    from './physics/physics-world.js';
import { XRSession }       from './xr/xr-session.js';
import { HandTracking }    from './xr/hand-tracking.js';
import { Locomotion }      from './xr/locomotion.js';
import { VRMLoader }       from './character/vrm-loader.js';
import { AnimationManager } from './character/animation-manager.js';
import { Ragdoll }         from './character/ragdoll.js';
import { GrabSystem }      from './character/grab-system.js';
import { DebugPanel }      from './debug/debug-panel.js';
import { DebugVisuals }    from './debug/debug-visuals.js';
import { copyDebugData }   from './debug/debug-copy.js';
import { COLORS }          from './utils/constants.js';

// ─────────────────────────────────────────────────────────────────────────────

async function main() {

  // ── Loading state ────────────────────────────────────────────────────────
  const loadingEl  = document.getElementById('loading');
  const loadingTxt = document.getElementById('loading-text');

  const showLoading = (msg) => {
    if (loadingEl)  loadingEl.style.display = 'flex';
    if (loadingTxt) loadingTxt.textContent  = msg ?? 'Loading…';
  };
  const hideLoading = () => {
    if (loadingEl) loadingEl.style.display = 'none';
  };

  showLoading('Initialising physics…');

  // ── Rapier WASM ──────────────────────────────────────────────────────────
  await RAPIER.init();
  const physicsWorld = new PhysicsWorld(RAPIER);

  // ── Renderer ─────────────────────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.BACKGROUND);

  // Optional faint grid (toggle via URL ?grid=1)
  if (new URLSearchParams(location.search).has('grid')) {
    const grid = new THREE.GridHelper(10, 20, 0x606060, 0x404040);
    grid.position.y = 0;
    scene.add(grid);
  }

  // ── Camera rig ────────────────────────────────────────────────────────────
  // The camera rig allows joystick locomotion to move the player.
  const cameraRig = new THREE.Group();
  cameraRig.name = 'camera-rig';
  scene.add(cameraRig);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 1.6, 0);
  cameraRig.add(camera);

  // ── Lighting — 3-point setup ──────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(COLORS.AMBIENT, 0.45);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(COLORS.KEY_LIGHT, 1.2);
  keyLight.position.set(1.5, 3, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far  = 20;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(COLORS.FILL_LIGHT, 0.3);
  fillLight.position.set(-2, 1.5, -1);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(COLORS.BACK_LIGHT, 0.4);
  backLight.position.set(0, 2, -3);
  scene.add(backLight);

  // ── Responsive resize ────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── WebXR session ─────────────────────────────────────────────────────────
  const xrSession    = new XRSession(renderer);
  const handTracking = new HandTracking(renderer, scene);
  const locomotion   = new Locomotion(renderer, cameraRig);

  // ── Debug ─────────────────────────────────────────────────────────────────
  const debugPanel   = new DebugPanel(renderer);
  const debugVisuals = new DebugVisuals(scene);
  debugVisuals.setupHandVisuals();

  // ── VRM + character systems ───────────────────────────────────────────────
  const vrmLoader  = new VRMLoader(scene);
  const animMgr    = new AnimationManager();

  let vrm       = null;
  let ragdoll   = null;
  let grabSystem = null;

  async function loadModel(url) {
    showLoading(`Loading model…`);

    // Dispose previous
    if (ragdoll)    { ragdoll.dispose();    ragdoll    = null; }
    if (grabSystem) { grabSystem.dispose(); grabSystem = null; }

    try {
      vrm = await vrmLoader.load(url, (e) => {
        const pct = e.total ? Math.round((e.loaded / e.total) * 100) : '…';
        showLoading(`Loading model… ${pct}%`);
      });

      animMgr.init(vrm);

      ragdoll    = new Ragdoll(vrm, physicsWorld, RAPIER);
      grabSystem = new GrabSystem(ragdoll, handTracking, physicsWorld, RAPIER);

      debugVisuals.setupColliderVisuals(ragdoll);
      debugVisuals.setupSkeletonHelper(vrm);

      hideLoading();
      console.info('[main] Character ready.');
    } catch (err) {
      hideLoading();
      console.warn('[main] VRM load failed:', err.message);
      debugPanel.setError('No model loaded — add character.vrm to public/models/');

      const instructionsEl = document.getElementById('instructions');
      if (instructionsEl) instructionsEl.style.display = 'block';
    }
  }

  // Initial auto-load
  const defaultModelUrl = '/models/character.vrm';
  loadModel(defaultModelUrl);

  // ── UI wiring ─────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  $('btn-toggle-debug')?.addEventListener('click', () => {
    debugPanel.toggle();
  });

  $('btn-copy-debug')?.addEventListener('click', () => {
    copyDebugData(debugPanel.getData());
  });

  let collidersOn = false;
  $('btn-toggle-colliders')?.addEventListener('click', (e) => {
    collidersOn = !collidersOn;
    debugVisuals.setShowColliders(collidersOn);
    e.currentTarget.classList.toggle('active', collidersOn);
  });

  let skeletonOn = false;
  $('btn-toggle-skeleton')?.addEventListener('click', (e) => {
    skeletonOn = !skeletonOn;
    debugVisuals.setShowSkeleton(skeletonOn);
    e.currentTarget.classList.toggle('active', skeletonOn);
  });

  $('model-load-btn')?.addEventListener('click', () => {
    const url = $('model-url-input')?.value?.trim();
    if (url) loadModel(url);
  });

  $('model-url-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = e.currentTarget.value.trim();
      if (url) loadModel(url);
    }
  });

  // ── Render loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  renderer.setAnimationLoop((timestamp, frame) => {
    // Cap delta to avoid spiral-of-death on tab focus-loss
    const delta = Math.min(clock.getDelta(), 0.05);

    // 1 — Physics step
    physicsWorld.step(delta);

    // 2 — Hand tracking (reads XRFrame joint poses)
    if (frame) {
      handTracking.update(frame);
    }

    // 3 — Grab system (applies PD forces)
    grabSystem?.update();

    // 4 — Sync ragdoll physics bodies → VRM bones
    ragdoll?.syncToVRM();

    // 5 — Advance VRM internals (spring bones, look-at, expressions)
    if (vrm) vrm.update(delta);

    // 6 — Advance animations
    animMgr.update(delta);

    // 7 — Smooth locomotion (joystick)
    if (frame) locomotion.update(delta, frame);

    // 8 — Update debug visuals
    debugVisuals.update();

    // 9 — Update debug panel HUD
    debugPanel.update(frame, { physicsWorld, handTracking, grabSystem, ragdoll });

    // 10 — Render
    renderer.render(scene, camera);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error('[main] Fatal error:', err);
  const el = document.getElementById('loading-text');
  if (el) el.textContent = 'Fatal error — see console.';
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'flex';
});
