/* =========================================================
   trainer.js — record & recognize custom hand-pose gestures
   Template = 21 landmarks normalized relative to wrist + scale.
   Matching = nearest-neighbour average landmark distance
   (see GestureEngine.matchCustomGesture).
   ========================================================= */
const Trainer = {
  STORAGE_KEY: 'gesturectrl_custom_gestures_v1',
  saved: [],
  recording: false,

  load() {
    try { this.saved = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]'); }
    catch (e) { this.saved = []; }
    return this.saved;
  },
  persist() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.saved)); },

  syncToEngine(engine) { engine.customGestures = this.saved; },

  normalize(lm) {
    const wrist = lm[0];
    const scale = Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y) || 0.001;
    return lm.map(p => ({ x: (p.x - wrist.x) / scale, y: (p.y - wrist.y) / scale }));
  },

  /** Records for ~2s, sampling frames, then averages the normalized landmark set. */
  record(name, keyBinding, { onProgress, onDone, onError, getLandmarks } = {}) {
    if (this.recording) return;
    if (!name || !name.trim()) { onError && onError('Please enter a gesture name.'); return; }
    this.recording = true;
    const durationMs = 2000;
    const start = performance.now();
    const samples = [];

    const tick = () => {
      const lm = getLandmarks();
      const elapsed = performance.now() - start;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      onProgress && onProgress(pct, !!lm);

      if (lm) samples.push(this.normalize(lm));

      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        this.recording = false;
        if (samples.length < 5) {
          onError && onError('Could not see your hand clearly enough. Try again with better lighting.');
          return;
        }
        const template = [];
        for (let i = 0; i < 21; i++) {
          let sx = 0, sy = 0;
          for (const s of samples) { sx += s[i].x; sy += s[i].y; }
          template.push({ x: sx / samples.length, y: sy / samples.length });
        }
        const gesture = { id: 'custom_' + Date.now(), name: name.trim(), key: (keyBinding || '').trim(), template };
        this.saved.push(gesture);
        this.persist();
        onDone && onDone(gesture);
      }
    };
    requestAnimationFrame(tick);
  },

  remove(id) {
    this.saved = this.saved.filter(g => g.id !== id);
    this.persist();
  },

  exportModel() {
    const blob = new Blob([JSON.stringify({ version: 1, gestures: this.saved }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gesturectrl-custom-model.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importModel(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const gestures = data.gestures || data;
        if (!Array.isArray(gestures)) throw new Error('bad format');
        this.saved = this.saved.concat(gestures);
        this.persist();
        cb && cb(null, gestures.length);
      } catch (e) { cb && cb(e); }
    };
    reader.readAsText(file);
  },
};
Trainer.load();
