import * as THREE from 'three';

/**
 * Camera-based hand tracking via MediaPipe Tasks Vision.
 *
 * Loads the HandLandmarker model from CDN, opens the device camera,
 * detects up to 2 hands every frame, draws the joint skeleton onto a
 * canvas overlay, and fires the same onPinchStart / onPinchEnd callbacks
 * that the WebXR HandTracking class uses — so the grab system works
 * without modification.
 */

// MediaPipe landmark indices (21 per hand)
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,  THUMB_MCP: 2,  THUMB_IP: 3,   THUMB_TIP: 4,
  INDEX_MCP: 5,  INDEX_PIP: 6,  INDEX_DIP: 7,  INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13,  RING_PIP: 14,  RING_DIP: 15,  RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],           // thumb
  [0,5],[5,6],[6,7],[7,8],           // index
  [0,9],[9,10],[10,11],[11,12],      // middle
  [0,13],[13,14],[14,15],[15,16],    // ring
  [0,17],[17,18],[18,19],[19,20],    // pinky
  [5,9],[9,13],[13,17],              // palm knuckles
];

const TIP_IDS     = new Set([4, 8, 12, 16, 20]);
const PINCH_DIST  = 0.07;  // normalised landmark units
const VISION_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15';
const MODEL_ASSET = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

function makeState() {
  return { detected: false, landmarks: null, pinching: false };
}

export class MediaPipeHands {
  /**
   * @param {HTMLVideoElement}  videoEl  — hidden element receiving camera stream
   * @param {HTMLCanvasElement} canvasEl — overlay canvas for joint visualisation
   */
  constructor(videoEl, canvasEl) {
    this._video    = videoEl;
    this._canvas   = canvasEl;
    this._ctx      = canvasEl.getContext('2d');
    this._lm       = null;   // HandLandmarker instance
    this._running  = false;
    this._lastTime = -1;
    this._camera   = null;   // THREE.Camera for 3-D projection
    this._depth    = 1.2;    // metres in front of camera for 3-D projection

    this._hands = { left: makeState(), right: makeState() };

    /** @type {((key: string, pos: THREE.Vector3) => void) | null} */
    this.onPinchStart = null;
    /** @type {((key: string) => void) | null} */
    this.onPinchEnd   = null;

    this._initPromise = null;
    this._initDone    = false;
    this._initError   = null;
  }

  /** Pass the scene camera so landmarks can be projected to 3-D world space. */
  setCamera(cam) { this._camera = cam; }

  // ── Initialisation ──────────────────────────────────────────────────────

  /**
   * Load MediaPipe WASM + model from CDN. Safe to call multiple times.
   * Returns a Promise that resolves when the landmarker is ready.
   */
  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    try {
      const { FilesetResolver, HandLandmarker } = await import(
        /* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`
      );
      const vision = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
      this._lm = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET,
          delegate: 'GPU',
        },
        numHands: 2,
        runningMode: 'VIDEO',
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence:  0.5,
        minTrackingConfidence:      0.5,
      });
      this._initDone = true;
      console.info('[MediaPipeHands] Ready.');
    } catch (err) {
      this._initError = err;
      console.error('[MediaPipeHands] Init failed:', err);
      throw err;
    }
  }

  // ── Camera lifecycle ────────────────────────────────────────────────────

  async startCamera() {
    if (!this._initDone) {
      try { await this.init(); } catch { return false; }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      this._video.srcObject = stream;
      await new Promise((res) => { this._video.onloadedmetadata = res; });
      await this._video.play();
      this._running = true;
      return true;
    } catch (err) {
      console.error('[MediaPipeHands] Camera error:', err);
      return false;
    }
  }

  stopCamera() {
    this._running = false;
    this._video.srcObject?.getTracks().forEach((t) => t.stop());
    this._video.srcObject = null;
    this._hands.left.detected  = false;
    this._hands.right.detected = false;
    if (this.onPinchEnd) {
      if (this._hands.left.pinching)  this.onPinchEnd('left');
      if (this._hands.right.pinching) this.onPinchEnd('right');
    }
    this._hands.left.pinching  = false;
    this._hands.right.pinching = false;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  update() {
    if (!this._running || !this._lm) return;
    if (this._video.readyState < 2)   return;
    if (this._video.currentTime === this._lastTime) return;
    this._lastTime = this._video.currentTime;

    // Keep canvas pixel-size in sync with its CSS size
    const rect = this._canvas.getBoundingClientRect();
    if (this._canvas.width  !== rect.width ||
        this._canvas.height !== rect.height) {
      this._canvas.width  = rect.width;
      this._canvas.height = rect.height;
    }

    const results = this._lm.detectForVideo(this._video, performance.now());
    this._processResults(results);
    this._drawOverlay(results);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _processResults(results) {
    this._hands.left.detected  = false;
    this._hands.right.detected = false;

    if (!results?.landmarks?.length) return;

    for (let i = 0; i < results.landmarks.length; i++) {
      const landmarks  = results.landmarks[i];
      const rawLabel   = results.handedness[i][0].categoryName.toLowerCase();
      // MediaPipe uses a mirrored view: their "Right" is user's left on screen
      const key        = rawLabel === 'right' ? 'left' : 'right';

      const hand     = this._hands[key];
      hand.detected  = true;
      hand.landmarks = landmarks;

      // Pinch: thumb-tip ↔ index-tip euclidean distance in normalised space
      const tT = landmarks[LM.THUMB_TIP];
      const iT = landmarks[LM.INDEX_TIP];
      const dx = tT.x - iT.x, dy = tT.y - iT.y, dz = tT.z - iT.z;
      const dist     = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const wasPinch = hand.pinching;
      hand.pinching  = dist < PINCH_DIST;

      if (!wasPinch &&  hand.pinching) this.onPinchStart?.(key, this._to3D(iT));
      if ( wasPinch && !hand.pinching) this.onPinchEnd?.(key);
    }
  }

  /**
   * Project a normalised MediaPipe landmark {x,y,z} to a THREE.Vector3
   * in world space, at a fixed depth in front of the scene camera.
   */
  _to3D(lm) {
    if (!this._camera) return new THREE.Vector3();
    // Flip x because the camera feed is displayed mirrored
    const ndcX =  (0.5 - lm.x) * 2;
    const ndcY = -(lm.y - 0.5) * 2;
    const dir  = new THREE.Vector3(ndcX, ndcY, -1)
      .unproject(this._camera)
      .sub(this._camera.position)
      .normalize();
    return this._camera.position.clone().addScaledVector(dir, this._depth);
  }

  _drawOverlay(results) {
    const ctx = this._ctx;
    const w   = this._canvas.width;
    const h   = this._canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!results?.landmarks?.length) return;

    for (let i = 0; i < results.landmarks.length; i++) {
      const landmarks = results.landmarks[i];
      const rawLabel  = results.handedness[i][0].categoryName.toLowerCase();
      const key       = rawLabel === 'right' ? 'left' : 'right';
      const pinching  = this._hands[key].pinching;

      const baseColor = key === 'left' ? '#00ffcc' : '#ff6699';

      // ── Skeleton lines ──────────────────────────────────────────────
      ctx.lineWidth   = 2;
      ctx.strokeStyle = baseColor + 'aa';
      for (const [a, b] of CONNECTIONS) {
        const A = landmarks[a], B = landmarks[b];
        ctx.beginPath();
        ctx.moveTo((1 - A.x) * w, A.y * h);   // mirror x for selfie view
        ctx.lineTo((1 - B.x) * w, B.y * h);
        ctx.stroke();
      }

      // ── Joint dots ──────────────────────────────────────────────────
      for (let j = 0; j < landmarks.length; j++) {
        const lm  = landmarks[j];
        const x   = (1 - lm.x) * w;
        const y   = lm.y * h;
        const tip = TIP_IDS.has(j);
        ctx.beginPath();
        ctx.arc(x, y, tip ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle   = tip ? '#ffffaa' : baseColor;
        ctx.fill();
        ctx.strokeStyle = '#00000088';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }

      // ── Pinch indicator ─────────────────────────────────────────────
      const tT = landmarks[LM.THUMB_TIP];
      const iT = landmarks[LM.INDEX_TIP];
      const cx = (1 - (tT.x + iT.x) * 0.5) * w;
      const cy = ((tT.y + iT.y) * 0.5) * h;

      if (pinching) {
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 3;
        ctx.stroke();
        ctx.fillStyle   = '#ffffff22';
        ctx.fill();
        ctx.fillStyle  = '#fff';
        ctx.font       = 'bold 11px system-ui';
        ctx.textAlign  = 'center';
        ctx.fillText('GRAB', cx, cy - 26);
      }

      // ── Hand label ──────────────────────────────────────────────────
      const wrist = landmarks[LM.WRIST];
      ctx.fillStyle = '#ffffffcc';
      ctx.font      = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(key.toUpperCase(), (1 - wrist.x) * w, wrist.y * h + 22);
    }
  }

  // ── Public interface (mirrors HandTracking) ──────────────────────────────

  isDetected(key)    { return this._hands[key]?.detected  ?? false; }
  isPinching(key)    { return this._hands[key]?.pinching  ?? false; }

  getPinchPosition(key) {
    const h = this._hands[key];
    if (!h?.landmarks) return new THREE.Vector3();
    return this._to3D(h.landmarks[LM.INDEX_TIP]);
  }

  getJointPosition(key, idx) {
    const h = this._hands[key];
    if (!h?.landmarks) return null;
    return this._to3D(h.landmarks[idx]);
  }

  getStatus() {
    return {
      left:  { detected: this._hands.left.detected,  pinching: this._hands.left.pinching  },
      right: { detected: this._hands.right.detected, pinching: this._hands.right.pinching },
    };
  }

  get isRunning()  { return this._running;   }
  get isReady()    { return this._initDone;  }
  get LANDMARK()   { return LM; }
}
