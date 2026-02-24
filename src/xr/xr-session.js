/**
 * XRSession manager.
 *
 * Handles "Enter VR" / "Exit VR" logic, requests hand-tracking and
 * DOM-overlay optional features, and wires up the Three.js renderer.
 */
export class XRSession {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.renderer.xr.enabled = true;

    this.session   = null;
    this.isActive  = false;

    this._button = document.getElementById('vr-button');
    this._overlay = document.getElementById('overlay');

    this._init();
  }

  // ── Public ──────────────────────────────────────────────────────────────

  getInfo() {
    if (!this.session) return null;
    return {
      active:        this.isActive,
      inputSources:  this.session.inputSources.length,
      blendMode:     this.session.environmentBlendMode ?? 'N/A',
      interactionMode: this.session.interactionMode ?? 'N/A',
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _init() {
    if (!this._button) return;

    if (!navigator.xr) {
      this._button.textContent = 'WebXR Unavailable';
      this._button.disabled    = true;
      return;
    }

    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
      if (!supported) {
        this._button.textContent = 'VR Not Supported';
        this._button.disabled    = true;
      }
    });

    this._button.addEventListener('click', () => {
      if (this.isActive) {
        this.session?.end();
      } else {
        this._enterVR();
      }
    });
  }

  async _enterVR() {
    const overlayEl = this._overlay;

    // Preferred: hand-tracking required + dom-overlay optional
    const sessionInit = {
      requiredFeatures: ['hand-tracking'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'bounded-floor'],
    };
    if (overlayEl) {
      sessionInit.domOverlay = { root: overlayEl };
    }

    try {
      await this._startSession(sessionInit);
    } catch (_) {
      // Fallback: make hand-tracking optional too (some devices / emulators)
      const fallbackInit = {
        optionalFeatures: ['hand-tracking', 'dom-overlay', 'local-floor', 'bounded-floor'],
      };
      if (overlayEl) fallbackInit.domOverlay = { root: overlayEl };

      try {
        await this._startSession(fallbackInit);
      } catch (err) {
        console.error('[XRSession] Could not start VR session:', err);
        alert('Could not start VR session:\n' + err.message);
      }
    }
  }

  async _startSession(init) {
    const xrSession = await navigator.xr.requestSession('immersive-vr', init);
    this.session  = xrSession;
    this.isActive = true;

    await this.renderer.xr.setSession(xrSession);

    if (this._button) this._button.textContent = 'Exit VR';

    xrSession.addEventListener('end', () => {
      this.session  = null;
      this.isActive = false;
      if (this._button) this._button.textContent = 'Enter VR';
    });
  }
}
