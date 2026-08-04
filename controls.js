/* =========================================================
   controls.js — gesture -> mapped action -> dispatch
   Dispatches locally (demo keyboard events on this tab) AND
   broadcasts a structured command for other tabs / the extension.
   ========================================================= */
const STATIC_POSES = new Set([
  'open_palm','closed_fist','pointing','thumbs_up','thumbs_down','peace',
  'ok_sign','rock_sign','three_fingers','four_fingers','five_fingers'
]);

const Controls = {
  onAction: null,          // (gestureName, mappedAction, meta) => void  (UI hook)
  lastPoseFired: { Left: null, Right: null },
  lastPoseTime: { Left: 0, Right: 0 },
  poseCooldownMs: 550,
  mouseEnabled: false,
  cursorPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  cursorSmoothing: 0.6,

  handleGesture(gestureName, confidence, meta = {}) {
    if (!Settings.get('enableGestures')) return;
    const hand = meta.hand || 'Right';

    // debounce static poses so they fire once per "entry", not every frame
    if (STATIC_POSES.has(gestureName)) {
      const now = performance.now();
      if (this.lastPoseFired[hand] === gestureName && now - this.lastPoseTime[hand] < this.poseCooldownMs) return;
      this.lastPoseFired[hand] = gestureName;
      this.lastPoseTime[hand] = now;
    }

    const mapping = Settings.map[gestureName];
    if (!mapping || mapping.enabled === false) {
      this._notifyUnmapped(gestureName, confidence, hand);
      return;
    }

    const command = {
      gesture: gestureName,
      actionType: mapping.type,
      action: mapping.value,
      label: mapping.label,
      confidence,
      hand,
    };

    Broadcaster.send(command);
    this._dispatchLocal(command, meta);

    if (this.onAction) this.onAction(gestureName, mapping, { hand, confidence });
  },

  _notifyUnmapped(gestureName, confidence, hand) {
    if (this.onAction) this.onAction(gestureName, null, { hand, confidence });
  },

  /** Executes the action on THIS tab too, so the app is useful standalone
   *  (e.g. demo receiver page, or testing without the extension). */
  _dispatchLocal(command, meta) {
    if (command.actionType === 'key') {
      this._dispatchKey(command.action);
    } else if (command.actionType === 'mouse') {
      this._dispatchMouse(command.action, meta);
    } else if (command.actionType === 'system') {
      this._dispatchSystem(command.action);
    }
  },

  _dispatchKey(code) {
    const opts = { code, key: this._codeToKey(code), bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', opts)), 60);
  },

  _codeToKey(code) {
    const map = { Space: ' ', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Escape: 'Escape' };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  },

  _dispatchMouse(action, meta) {
    const cursor = document.getElementById('virtualCursor');
    if (action === 'move' && meta.point) {
      this._moveCursor(meta.point);
      return;
    }
    if (!cursor) return;
    const rect = cursor.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y) || document.body;
    const evName = action === 'dblclick' ? 'dblclick' : action === 'rightclick' ? 'contextmenu' : 'click';
    target.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    cursor.style.transform = 'translate(-50%,-50%) scale(0.7)';
    setTimeout(() => cursor.style.transform = 'translate(-50%,-50%) scale(1)', 120);
  },

  _dispatchSystem(action) {
    if (action === 'fullscreen') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.().catch(() => {});
    }
  },

  _moveCursor(normPoint) {
    if (!this.mouseEnabled) return;
    const cursor = document.getElementById('virtualCursor');
    if (!cursor) return;
    const targetX = normPoint.x * window.innerWidth;
    const targetY = normPoint.y * window.innerHeight;
    const s = this.cursorSmoothing;
    this.cursorPos.x = this.cursorPos.x * s + targetX * (1 - s);
    this.cursorPos.y = this.cursorPos.y * s + targetY * (1 - s);
    cursor.style.display = 'block';
    cursor.style.left = this.cursorPos.x + 'px';
    cursor.style.top = this.cursorPos.y + 'px';
  },

  setMouseEnabled(v) {
    this.mouseEnabled = v;
    const cursor = document.getElementById('virtualCursor');
    if (cursor) cursor.style.display = v ? 'block' : 'none';
  },
};
