/* =========================================================
   camera.js — webcam lifecycle + MediaPipe Hands pipeline
   ========================================================= */
const CameraModule = {
  video: null,
  overlay: null,
  ctx: null,
  hands: null,
  mpCamera: null,
  running: false,
  frameCount: 0,
  lastFpsTime: 0,
  fps: 0,
  engine: null,
  onResults: null,      // (perHandOutput, results) => void
  onFps: null,          // (fps) => void
  onStatus: null,       // (running:boolean) => void
  showSkeleton: true,
  mirror: true,
  deviceId: null,
  stream: null,

  init() {
    this.video = document.getElementById('video');
    this.overlay = document.getElementById('overlay');
    this.ctx = this.overlay.getContext('2d');

    this.engine = new GestureEngine({
      sensitivity: Settings.get('sensitivity'),
      holdTimeMs: Settings.get('holdTimeMs'),
      pinchThreshold: Settings.get('pinchThreshold'),
      onGesture: (name, confidence, meta) => {
        const lm = this.lastLmByHand && this.lastLmByHand[meta.hand];
        if (lm) meta.point = { x: this.mirror ? 1 - lm[8].x : lm[8].x, y: lm[8].y };
        if (this.onGestureEvent) this.onGestureEvent(name, confidence, meta);
      },
    });

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.6,
    });
    this.hands.onResults((results) => this._onResults(results));
  },

  async listDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) { return []; }
  },

  async start() {
    if (this.running) return;
    const constraints = {
      video: {
        width: { ideal: 1280 }, height: { ideal: 720 },
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
      },
      audio: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    this._resizeCanvas();

    this.mpCamera = new Camera(this.video, {
      onFrame: async () => {
        if (!this.running) return;
        await this.hands.send({ image: this.video });
        this._tickFps();
      },
      width: 1280,
      height: 720,
    });
    this.mpCamera.start();
    this.running = true;
    this.onStatus && this.onStatus(true);
  },

  stop() {
    this.running = false;
    if (this.mpCamera) { this.mpCamera.stop(); this.mpCamera = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.ctx && this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.onStatus && this.onStatus(false);
  },

  toggleMirror(v) {
    this.mirror = v;
    this.video.classList.toggle('mirror', v);
    this.overlay.classList.toggle('mirror', v);
  },

  _resizeCanvas() {
    const rect = this.video.getBoundingClientRect();
    this.overlay.width = rect.width;
    this.overlay.height = rect.height;
  },

  _tickFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      this.onFps && this.onFps(this.fps);
    }
  },

  _onResults(results) {
    this._resizeCanvas();
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    if (this.showSkeleton && results.multiHandLandmarks) {
      for (const lm of results.multiHandLandmarks) {
        if (window.drawConnectors && window.HAND_CONNECTIONS) {
          drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: 'rgba(0,240,255,0.8)', lineWidth: 3 });
        }
        if (window.drawLandmarks) {
          drawLandmarks(ctx, lm, { color: 'rgba(176,38,255,0.95)', lineWidth: 1, radius: 3 });
        }
      }
    }
    ctx.restore();

    this.latestLandmarks = (results.multiHandLandmarks && results.multiHandLandmarks[0]) || null;
    this.lastLmByHand = {};
    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((lm, i) => {
        this.lastLmByHand[results.multiHandedness[i].label] = lm;
      });
    }

    const perHandOutput = this.engine.process(results);

    // mouse control: index fingertip of the "pointing"/right hand drives the virtual cursor
    if (Controls.mouseEnabled && results.multiHandLandmarks && results.multiHandLandmarks.length) {
      const lm = results.multiHandLandmarks[0];
      const tip = lm[8];
      const x = this.mirror ? 1 - tip.x : tip.x;
      Controls._moveCursor({ x, y: tip.y });
    }

    this.onResults && this.onResults(perHandOutput, results);
  },
};
