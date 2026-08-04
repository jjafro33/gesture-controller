/* =========================================================
   settings.js — persisted app configuration
   ========================================================= */
const DEFAULT_GESTURE_MAP = {
  open_palm:      { type: 'key',   value: 'Space',      label: 'Pause / Play',   enabled: true },
  closed_fist:    { type: 'key',   value: 'Space',       label: 'Play / Pause',  enabled: true },
  pointing:       { type: 'mouse', value: 'move',        label: 'Move cursor',   enabled: true },
  thumbs_up:      { type: 'key',   value: 'ArrowUp',     label: 'Volume up / Sprint', enabled: true },
  thumbs_down:    { type: 'key',   value: 'ArrowDown',   label: 'Volume down',   enabled: true },
  peace:          { type: 'key',   value: 'KeyJ',        label: 'Jump / Back 10s', enabled: true },
  ok_sign:        { type: 'mouse', value: 'click',       label: 'Confirm / Click', enabled: true },
  rock_sign:      { type: 'key',   value: 'KeyM',        label: 'Mute',          enabled: true },
  swipe_left:     { type: 'key',   value: 'ArrowLeft',   label: 'Previous / Rewind', enabled: true },
  swipe_right:    { type: 'key',   value: 'ArrowRight',  label: 'Next / Forward', enabled: true },
  swipe_up:       { type: 'key',   value: 'ArrowUp',     label: 'Scroll up',     enabled: true },
  swipe_down:     { type: 'key',   value: 'ArrowDown',   label: 'Scroll down',   enabled: true },
  pinch:          { type: 'mouse', value: 'click',       label: 'Mouse click',   enabled: true },
  zoom_in:        { type: 'key',   value: 'Equal',       label: 'Zoom in',       enabled: true },
  zoom_out:       { type: 'key',   value: 'Minus',       label: 'Zoom out',      enabled: true },
  rotate_cw:      { type: 'key',   value: 'KeyE',        label: 'Rotate clockwise', enabled: true },
  rotate_ccw:     { type: 'key',   value: 'KeyQ',        label: 'Rotate counter-clockwise', enabled: true },
  hold_gesture:   { type: 'key',   value: 'ShiftLeft',   label: 'Charge / Hold', enabled: true },
  double_pinch:   { type: 'mouse', value: 'dblclick',    label: 'Double click',  enabled: true },
  three_fingers:  { type: 'key',   value: 'KeyR',        label: 'Reload',        enabled: true },
  four_fingers:   { type: 'key',   value: 'KeyF',        label: 'Fullscreen',    enabled: true },
  five_fingers:   { type: 'key',   value: 'Escape',      label: 'ESC',           enabled: true },
};

const GAMING_PRESET = {
  open_palm:   { type: 'key', value: 'Space',      label: 'Pause', enabled: true },
  swipe_left:  { type: 'key', value: 'ArrowLeft',  label: 'Move Left', enabled: true },
  swipe_right: { type: 'key', value: 'ArrowRight', label: 'Move Right', enabled: true },
  closed_fist: { type: 'key', value: 'KeyX',       label: 'Attack', enabled: true },
  peace:       { type: 'key', value: 'ArrowUp',    label: 'Jump', enabled: true },
  thumbs_up:   { type: 'key', value: 'ShiftLeft',  label: 'Sprint', enabled: true },
  pinch:       { type: 'mouse', value: 'click',    label: 'Shoot', enabled: true },
  hold_gesture:{ type: 'key', value: 'KeyC',       label: 'Charge', enabled: true },
};

const GESTURE_META = {
  open_palm:     { emoji: '🖐️', name: 'Open Palm' },
  closed_fist:   { emoji: '✊', name: 'Closed Fist' },
  pointing:      { emoji: '☝️', name: 'Pointing Finger' },
  thumbs_up:     { emoji: '👍', name: 'Thumbs Up' },
  thumbs_down:   { emoji: '👎', name: 'Thumbs Down' },
  peace:         { emoji: '✌️', name: 'Peace Sign' },
  ok_sign:       { emoji: '👌', name: 'OK Sign' },
  rock_sign:     { emoji: '🤘', name: 'Rock Sign' },
  swipe_left:    { emoji: '⬅️', name: 'Swipe Left' },
  swipe_right:   { emoji: '➡️', name: 'Swipe Right' },
  swipe_up:      { emoji: '⬆️', name: 'Swipe Up' },
  swipe_down:    { emoji: '⬇️', name: 'Swipe Down' },
  pinch:         { emoji: '🤏', name: 'Pinch' },
  zoom_in:       { emoji: '🔍', name: 'Zoom In' },
  zoom_out:      { emoji: '🔎', name: 'Zoom Out' },
  rotate_cw:     { emoji: '🔄', name: 'Rotate Clockwise' },
  rotate_ccw:    { emoji: '🔃', name: 'Rotate Counter-CW' },
  hold_gesture:  { emoji: '⏸️', name: 'Hold Gesture' },
  double_pinch:  { emoji: '🤏🤏', name: 'Double Pinch' },
  three_fingers: { emoji: '3️⃣', name: 'Three Fingers' },
  four_fingers:  { emoji: '4️⃣', name: 'Four Fingers' },
  five_fingers:  { emoji: '5️⃣', name: 'Five Fingers' },
};

const Settings = {
  KEY: 'gesturectrl_settings_v1',
  MAP_KEY: 'gesturectrl_mapping_v1',
  defaults: {
    theme: 'dark',
    handMode: 'right',
    cameraDeviceId: null,
    mirror: true,
    showSkeleton: true,
    enableGestures: true,
    fpsLimit: 30,
    sensitivity: 0.7,
    holdTimeMs: 350,
    cursorSmoothing: 0.6,
    pinchThreshold: 0.055,
    channelName: 'gesture-control-channel',
  },
  data: {},
  map: {},

  load() {
    try { this.data = { ...this.defaults, ...JSON.parse(localStorage.getItem(this.KEY) || '{}') }; }
    catch (e) { this.data = { ...this.defaults }; }
    try { this.map = { ...DEFAULT_GESTURE_MAP, ...JSON.parse(localStorage.getItem(this.MAP_KEY) || '{}') }; }
    catch (e) { this.map = { ...DEFAULT_GESTURE_MAP }; }
    return this.data;
  },
  save() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); },
  saveMap() { localStorage.setItem(this.MAP_KEY, JSON.stringify(this.map)); },
  set(key, value) { this.data[key] = value; this.save(); },
  get(key) { return this.data[key]; },
  resetAll() {
    localStorage.removeItem(this.KEY);
    localStorage.removeItem(this.MAP_KEY);
    this.load();
  },
  applyPreset(preset) {
    this.map = { ...this.map, ...preset };
    this.saveMap();
  }
};
Settings.load();
