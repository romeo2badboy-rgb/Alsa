/**
 * ALFA — VR Interactive Character
 *
 * Entry point: bootstraps the Three.js scene, WebXR session, Rapier physics,
 * VRM character, and wires together:
 *  - WebXR hand tracking (VR headset)
 *  - MediaPipe camera hand tracking (mobile / desktop no-headset)
 *  - Character model picker (GitHub asset pack)
 *  - Animation picker (GitHub BVH pack)
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { injectSpeedInsights } from '@vercel/speed-insights';

import { PhysicsWorld }    from './physics/physics-world.js';
import { XRSession }       from './xr/xr-session.js';
import { HandTracking }    from './xr/hand-tracking.js';
import { Locomotion }      from './xr/locomotion.js';
import { MediaPipeHands }  from './xr/mediapipe-hands.js';
import { VRMLoader }       from './character/vrm-loader.js';
import { AnimationManager } from './character/animation-manager.js';
import { Ragdoll }         from './character/ragdoll.js';
import { GrabSystem }      from './character/grab-system.js';
import { DebugPanel }      from './debug/debug-panel.js';
import { DebugVisuals }    from './debug/debug-visuals.js';
import { copyDebugData }   from './debug/debug-copy.js';
import { ModelPicker }     from './ui/model-picker.js';
import { AnimationPicker } from './ui/animation-picker.js';
import { COLORS }          from './utils/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Initialize Vercel Speed Insights
injectSpeedInsights();

// ─────────────────────────────────────────────────────────────────────────────

async function main() {

  // ── DOM helpers ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const loadingEl  = $('loading');
  const loadingTxt = $('loading-text');

  const showLoading = (msg) => {
    if (loadingEl)  loadingEl.style.display = 'flex';
    if (loadingTxt) loadingTxt.textContent  = msg ?? 'Loading…';
  };
  const hideLoading = () => {
    if (loadingEl) loadingEl.style.display = 'none';
  };

  // Toast notification
  let _toastTimer = null;
  const showToast = (msg, ms = 2200) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  };

  showLoading('Initialising physics…');

  // ── Rapier WASM ──────────────────────────────────────────────────────────
  await RAPIER.init();
  const physicsWorld = new PhysicsWorld(RAPIER);

  // ── Renderer ─────────────────────────────────────────────────────────────
  const canvas = $('canvas');
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

  if (new URLSearchParams(location.search).has('grid')) {
    scene.add(new THREE.GridHelper(10, 20, 0x606060, 0x404040));
  }

  // ── Camera rig ────────────────────────────────────────────────────────────
  const cameraRig = new THREE.Group();
  cameraRig.name  = 'camera-rig';
  scene.add(cameraRig);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 1.6, 0);
  cameraRig.add(camera);

  // ── Lighting ──────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(COLORS.AMBIENT, 0.45));

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

  // ── MediaPipe camera hand tracking ───────────────────────────────────────
  const videoEl    = $('camera-video');
  const handCanvas = $('hand-canvas');
  const cameraPip  = $('camera-pip');

  const mpHands = new MediaPipeHands(videoEl, handCanvas);
  mpHands.setCamera(camera);

  // Kick off WASM + model download in the background (non-blocking)
  mpHands.init().catch((err) => {
    console.warn('[main] MediaPipe init failed (camera tracking unavailable):', err.message);
  });

  // ── Debug ─────────────────────────────────────────────────────────────────
  const debugPanel   = new DebugPanel(renderer);
  const debugVisuals = new DebugVisuals(scene);
  debugVisuals.setupHandVisuals();

  // ── VRM + character systems ───────────────────────────────────────────────
  const vrmLoader = new VRMLoader(scene);
  const animMgr   = new AnimationManager();

  let vrm        = null;
  let ragdoll    = null;
  let grabSystem = null;

  async function loadModel(url) {
    showLoading('Loading model…');
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

      // Also wire MediaPipe pinch events to the same grab system
      mpHands.onPinchStart = handTracking.onPinchStart;
      mpHands.onPinchEnd   = handTracking.onPinchEnd;

      debugVisuals.setupColliderVisuals(ragdoll);
      debugVisuals.setupSkeletonHelper(vrm);

      hideLoading();
      $('instructions').style.display = 'none';
      console.info('[main] Character ready.');
    } catch (err) {
      hideLoading();
      console.warn('[main] VRM load failed:', err.message);
      debugPanel.setError('Load failed — check the URL or CORS policy.');
      $('instructions').style.display = 'block';
    }
  }

  // Auto-load: try local placeholder first, fall back to instructions
  loadModel('/models/character.vrm');

  // ── Model picker ─────────────────────────────────────────────────────────
  const modelPicker = new ModelPicker((url, name) => {
    showToast(`Loading ${name}…`);
    loadModel(url);
    closePanels();
  });

  // ── Animation picker ──────────────────────────────────────────────────────
  const animPicker = new AnimationPicker(async (url, name) => {
    if (!vrm) {
      showToast('Load a character first!');
      return;
    }
    showLoading(`Loading animation: ${name}…`);
    try {
      await animMgr.loadBVH(url, name);
      animMgr.play(name);
      showToast(`▶ ${name.replace(/_/g, ' ')}`);
    } catch (err) {
      debugPanel.setError(`Animation load failed: ${name}`);
      showToast(`Failed to load animation`);
    } finally {
      hideLoading();
    }
  });

  // ── Panel backdrop ────────────────────────────────────────────────────────
  let _activePanels = 0;

  function openPanel(panelFn) {
    panelFn();
    $('panel-backdrop').classList.add('active');
    _activePanels++;
  }
  function closePanels() {
    modelPicker.hide();
    animPicker.hide();
    $('panel-backdrop').classList.remove('active');
    _activePanels = 0;
    $('btn-characters').classList.remove('active');
    $('btn-animations').classList.remove('active');
  }

  $('panel-backdrop').addEventListener('click', closePanels);

  // ── UI wiring ─────────────────────────────────────────────────────────────

  // Camera hand tracking toggle
  let cameraActive = false;
  $('btn-camera')?.addEventListener('click', async (e) => {
    if (cameraActive) {
      mpHands.stopCamera();
      cameraPip.classList.remove('active');
      e.currentTarget.classList.remove('active');
      cameraActive = false;
      // Switch grab system back to XR hand tracking
      if (grabSystem) grabSystem.setHandSource(handTracking);
      showToast('Camera off');
    } else {
      showToast('Starting camera…');
      const ok = await mpHands.startCamera();
      if (ok) {
        cameraPip.classList.add('active');
        e.currentTarget.classList.add('active');
        cameraActive = true;
        // Route pinch events from camera hands to the grab system
        if (grabSystem) grabSystem.setHandSource(mpHands);
        showToast('Camera hand tracking active — pinch to grab!');
      } else {
        showToast('Camera access denied');
      }
    }
  });

  // Character picker
  $('btn-characters')?.addEventListener('click', (e) => {
    const willOpen = !modelPicker._visible;
    closePanels();
    if (willOpen) {
      openPanel(() => modelPicker.show());
      e.currentTarget.classList.add('active');
    }
  });

  // Animation picker
  $('btn-animations')?.addEventListener('click', (e) => {
    if (!vrm) { showToast('Load a character first!'); return; }
    const willOpen = !animPicker._visible;
    closePanels();
    if (willOpen) {
      openPanel(() => animPicker.show());
      e.currentTarget.classList.add('active');
    }
  });

  // Open characters picker from the instructions dialog
  $('btn-open-chars-from-dialog')?.addEventListener('click', () => {
    $('instructions').style.display = 'none';
    openPanel(() => modelPicker.show());
    $('btn-characters').classList.add('active');
  });

  // Debug panel toggle
  $('btn-toggle-debug')?.addEventListener('click', () => { debugPanel.toggle(); });

  // Copy debug data
  $('btn-copy-debug')?.addEventListener('click', () => { copyDebugData(debugPanel.getData()); });

  // Colliders toggle
  let collidersOn = false;
  $('btn-toggle-colliders')?.addEventListener('click', (e) => {
    collidersOn = !collidersOn;
    debugVisuals.setShowColliders(collidersOn);
    e.currentTarget.classList.toggle('active', collidersOn);
  });

  // Skeleton toggle
  let skeletonOn = false;
  $('btn-toggle-skeleton')?.addEventListener('click', (e) => {
    skeletonOn = !skeletonOn;
    debugVisuals.setShowSkeleton(skeletonOn);
    e.currentTarget.classList.toggle('active', skeletonOn);
  });

  // ── Render loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  renderer.setAnimationLoop((timestamp, frame) => {
    const delta = Math.min(clock.getDelta(), 0.05);

    // 1 — Physics
    physicsWorld.step(delta);

    // 2 — Hand tracking: WebXR in VR, MediaPipe outside VR
    if (frame) {
      handTracking.update(frame);
    } else if (cameraActive) {
      mpHands.update();
    }

    // 3 — Grab system
    grabSystem?.update();

    // 4 — Ragdoll → VRM bones
    ragdoll?.syncToVRM();

    // 5 — VRM spring bones / look-at / expressions
    if (vrm) vrm.update(delta);

    // 6 — Animations
    animMgr.update(delta);

    // 7 — Locomotion (joystick, VR only)
    if (frame) locomotion.update(delta, frame);

    // 8 — Debug visuals
    debugVisuals.update();

    // 9 — Debug panel
    const activeHandStatus = cameraActive && !frame
      ? mpHands.getStatus()
      : handTracking.getStatus();
    debugPanel.update(frame, {
      physicsWorld,
      handTracking: { getStatus: () => activeHandStatus },
      grabSystem,
      ragdoll,
    });

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
