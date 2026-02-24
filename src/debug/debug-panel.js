import { formatBytes, formatNum } from '../utils/helpers.js';

/**
 * DOM-based debug HUD.
 *
 * On desktop: fixed-position overlay.
 * In VR: visible through the DOM Overlay API (the `#overlay` div is forwarded
 *         into the headset by the XR session).
 */
export class DebugPanel {
  /**
   * @param {import('three').WebGLRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled  = true;

    // FPS tracking
    this._fpsFrames   = 0;
    this._fpsLastTime = performance.now();
    this._fps         = 0;

    this._errorMsg = null;

    this._el = document.getElementById('debug-panel');
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.id = 'debug-panel';
      (document.getElementById('overlay') ?? document.body).appendChild(this._el);
    }

    // Stored snapshot for clipboard export
    this._snapshot = {};
  }

  // ── Public ──────────────────────────────────────────────────────────────

  /** Show a persistent error message at the bottom of the panel. */
  setError(msg) {
    this._errorMsg = msg;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this._el) this._el.style.display = this.enabled ? '' : 'none';
  }

  /** Return the latest data snapshot (used by debug-copy). */
  getData() {
    return this._snapshot;
  }

  /**
   * Call every frame.
   * @param {XRFrame | null} frame
   * @param {{ physicsWorld?, handTracking?, grabSystem?, ragdoll? }} systems
   */
  update(frame, systems = {}) {
    // ── FPS ──────────────────────────────────────────────────────────────
    this._fpsFrames++;
    const now     = performance.now();
    const elapsed = now - this._fpsLastTime;
    if (elapsed >= 500) {
      this._fps         = Math.round((this._fpsFrames * 1000) / elapsed);
      this._fpsFrames   = 0;
      this._fpsLastTime = now;
    }

    if (!this.enabled || !this._el) return;

    const { physicsWorld, handTracking, grabSystem } = systems;
    const info   = this.renderer.info;
    const xr     = this.renderer.xr;
    const hands  = handTracking?.getStatus() ?? null;
    const grabs  = grabSystem?.getGrabState()  ?? {};

    // Memory (Chrome / Edge only)
    const memUsed  = performance.memory?.usedJSHeapSize  ?? null;
    const memLimit = performance.memory?.jsHeapSizeLimit  ?? null;
    const memStr   = memUsed != null
      ? `${formatBytes(memUsed)} / ${formatBytes(memLimit)}`
      : 'N/A';

    // XR info
    const xrInfo = xr.isPresenting
      ? `presenting | cam×${xr.getCamera().cameras.length}`
      : 'not presenting';

    // Hand status helpers
    const handStr = (h) =>
      h ? `${h.detected ? '✓' : '✗'} ${h.pinching ? '[PINCH]' : ''}`.trim() : '—';

    const lines = [
      `<b>─── ALFA DEBUG ───</b>`,
      `FPS: <span style="color:#ff0">${this._fps}</span>`,
      `Draw calls: ${formatNum(info.render.calls)}`,
      `Triangles:  ${formatNum(info.render.triangles)}`,
      `Memory:     ${memStr}`,
      ``,
      `<b>─── WebXR ───</b>`,
      `Session: ${xrInfo}`,
      ``,
      `<b>─── Hands ───</b>`,
      `Left:  ${handStr(hands?.left)}`,
      `Right: ${handStr(hands?.right)}`,
      ``,
      `<b>─── Physics ───</b>`,
      `Bodies:  ${physicsWorld?.bodyCount  ?? '—'}`,
      `Joints:  ${physicsWorld?.jointCount ?? '—'}`,
      ``,
      `<b>─── Grab ───</b>`,
      `Left:  ${grabs.left?.boneName  ?? 'none'}`,
      `Right: ${grabs.right?.boneName ?? 'none'}`,
    ];

    if (this._errorMsg) {
      lines.push(
        ``,
        `<span style="color:#f55"><b>─── ERROR ───</b></span>`,
        `<span style="color:#f88">${this._errorMsg}</span>`,
      );
    }

    this._el.innerHTML = lines.join('<br>');

    // Store snapshot
    this._snapshot = {
      timestamp:   new Date().toISOString(),
      fps:         this._fps,
      render:      { calls: info.render.calls, triangles: info.render.triangles },
      memory:      memStr,
      xr:          xrInfo,
      hands:       hands,
      physics:     { bodies: physicsWorld?.bodyCount, joints: physicsWorld?.jointCount },
      grabs,
      error:       this._errorMsg,
    };
  }
}
