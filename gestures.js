/* =========================================================
   gestures.js — landmark geometry -> gesture classification
   Static poses + temporal (swipe/pinch/zoom/rotate/hold) gestures
   built purely from MediaPipe's 21-point hand landmarks.
   ========================================================= */

const FINGER_IDX = {
  thumb:  { tip: 4,  pip: 3,  mcp: 2 },
  index:  { tip: 8,  pip: 6,  mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring:   { tip: 16, pip: 14, mcp: 13 },
  pinky:  { tip: 20, pip: 18, mcp: 17 },
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}
function avg(points) {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
    z: points.reduce((s, p) => s + (p.z || 0), 0) / n,
  };
}

class GestureEngine {
  constructor(opts = {}) {
    this.sensitivity = opts.sensitivity ?? 0.7;
    this.holdTimeMs = opts.holdTimeMs ?? 350;
    this.pinchThreshold = opts.pinchThreshold ?? 0.055;
    this.onGesture = opts.onGesture || (() => {});
    this.history = { Left: [], Right: [] };
    this.pinchState = { Left: { active: false, lastRelease: 0, count: 0 }, Right: { active: false, lastRelease: 0, count: 0 } };
    this.stable = { name: null, since: 0, hand: null };
    this.lastEmitted = null;
    this.twoHandDistHistory = [];
    this.twoHandAngleHistory = [];
    this.swipeCooldownUntil = 0;
    this.customGestures = []; // [{name, key, template:[21 normalized pts relative to wrist]}]
  }

  updateSettings({ sensitivity, holdTimeMs, pinchThreshold }) {
    if (sensitivity != null) this.sensitivity = sensitivity;
    if (holdTimeMs != null) this.holdTimeMs = holdTimeMs;
    if (pinchThreshold != null) this.pinchThreshold = pinchThreshold;
  }

  /** returns [thumb,index,middle,ring,pinky] booleans */
  fingerStates(lm, handedness) {
    const wrist = lm[0];
    const states = {};
    for (const [name, idx] of Object.entries(FINGER_IDX)) {
      const tip = lm[idx.tip], pip = lm[idx.pip], mcp = lm[idx.mcp];
      if (name === 'thumb') {
        // thumb extended: tip far from pinky-mcp (17) relative to wrist, sideways motion
        const palmWidth = dist(lm[5], lm[17]) || 0.001;
        const spread = dist(tip, lm[17]) / palmWidth;
        states.thumb = spread > 1.35;
      } else {
        const tipToWrist = dist(tip, wrist);
        const pipToWrist = dist(pip, wrist);
        states[name] = tipToWrist > pipToWrist * 1.12;
      }
    }
    return states;
  }

  palmCenter(lm) { return avg([lm[0], lm[5], lm[9], lm[13], lm[17]]); }

  classifyStatic(lm, states, handedness) {
    const extCount = Object.values(states).filter(Boolean).length;
    const wrist = lm[0];
    const thumbTip = lm[4], indexTip = lm[8], middleTip = lm[12], ringTip = lm[16], pinkyTip = lm[20];
    const palmW = dist(lm[5], lm[17]) || 0.001;

    // OK sign: thumb+index tips close, other three extended
    const thumbIndexDist = dist(thumbTip, indexTip) / palmW;
    if (thumbIndexDist < 0.35 && states.middle && states.ring && states.pinky) {
      return { name: 'ok_sign', confidence: 0.9 };
    }
    // Rock sign: index + pinky extended, middle+ring curled
    if (states.index && states.pinky && !states.middle && !states.ring) {
      return { name: 'rock_sign', confidence: 0.86 };
    }
    // Peace: index + middle extended only, spread apart
    if (states.index && states.middle && !states.ring && !states.pinky) {
      const spread = dist(indexTip, middleTip) / palmW;
      return { name: 'peace', confidence: spread > 0.3 ? 0.92 : 0.8 };
    }
    // Pointing: only index extended
    if (states.index && !states.middle && !states.ring && !states.pinky && !states.thumb) {
      return { name: 'pointing', confidence: 0.9 };
    }
    // Thumbs up / down: only thumb extended
    if (states.thumb && !states.index && !states.middle && !states.ring && !states.pinky) {
      const up = thumbTip.y < wrist.y - 0.05;
      const down = thumbTip.y > wrist.y + 0.05;
      if (up) return { name: 'thumbs_up', confidence: 0.9 };
      if (down) return { name: 'thumbs_down', confidence: 0.9 };
    }
    // Closed fist: nothing extended
    if (extCount === 0) return { name: 'closed_fist', confidence: 0.92 };
    // Open palm / five fingers: all extended & spread
    if (extCount === 5) {
      const spread = (dist(indexTip, pinkyTip)) / palmW;
      return { name: spread > 0.9 ? 'open_palm' : 'five_fingers', confidence: 0.88 };
    }
    if (extCount === 4 && !states.thumb) return { name: 'four_fingers', confidence: 0.82 };
    if (extCount === 3 && states.index && states.middle && states.ring && !states.thumb && !states.pinky) {
      return { name: 'three_fingers', confidence: 0.8 };
    }
    return null;
  }

  detectPinch(lm, handLabel, palmW) {
    const d = dist(lm[4], lm[8]) / (palmW || 0.001);
    const isPinching = d < (this.pinchThreshold / 0.06) * 0.4; // normalized threshold scaling
    const st = this.pinchState[handLabel];
    let event = null;
    if (isPinching && !st.active) {
      st.active = true;
      const now = performance.now();
      if (now - st.lastRelease < 550) {
        st.count++;
        if (st.count >= 2) { event = 'double_pinch'; st.count = 0; }
      } else {
        st.count = 1;
        event = 'pinch';
      }
    } else if (!isPinching && st.active) {
      st.active = false;
      st.lastRelease = performance.now();
    }
    return { isPinching, event };
  }

  pushHistory(handLabel, sample) {
    const h = this.history[handLabel];
    h.push(sample);
    const cutoff = performance.now() - 700;
    while (h.length && h[0].t < cutoff) h.shift();
  }

  detectSwipe(handLabel) {
    const h = this.history[handLabel];
    if (h.length < 4) return null;
    if (performance.now() < this.swipeCooldownUntil) return null;
    const first = h[0], last = h[h.length - 1];
    const dt = last.t - first.t;
    if (dt < 60 || dt > 650) return null;
    const dx = last.x - first.x, dy = last.y - first.y;
    const distTravelled = Math.hypot(dx, dy);
    const speedThreshold = 0.35 * (1.4 - this.sensitivity); // more sensitive -> lower threshold
    if (distTravelled < Math.max(0.18, speedThreshold)) return null;
    let gesture;
    if (Math.abs(dx) > Math.abs(dy)) gesture = dx > 0 ? 'swipe_right' : 'swipe_left';
    else gesture = dy > 0 ? 'swipe_down' : 'swipe_up';
    this.swipeCooldownUntil = performance.now() + 500;
    this.history[handLabel] = [];
    return gesture;
  }

  detectTwoHandGestures(handsData) {
    if (handsData.length < 2) { this.twoHandDistHistory = []; this.twoHandAngleHistory = []; return null; }
    const [a, b] = handsData;
    const ca = this.palmCenter(a.lm), cb = this.palmCenter(b.lm);
    const d = dist(ca, cb);
    const angle = Math.atan2(cb.y - ca.y, cb.x - ca.x);
    const now = performance.now();
    this.twoHandDistHistory.push({ t: now, d });
    this.twoHandAngleHistory.push({ t: now, a: angle });
    const cutoff = now - 500;
    this.twoHandDistHistory = this.twoHandDistHistory.filter(p => p.t > cutoff);
    this.twoHandAngleHistory = this.twoHandAngleHistory.filter(p => p.t > cutoff);
    if (this.twoHandDistHistory.length > 3) {
      const dd = d - this.twoHandDistHistory[0].d;
      if (Math.abs(dd) > 0.12) {
        this.twoHandDistHistory = [];
        return dd > 0 ? 'zoom_in' : 'zoom_out';
      }
    }
    if (this.twoHandAngleHistory.length > 3) {
      let da = angle - this.twoHandAngleHistory[0].a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.5) {
        this.twoHandAngleHistory = [];
        return da > 0 ? 'rotate_cw' : 'rotate_ccw';
      }
    }
    return null;
  }

  matchCustomGesture(lm) {
    if (!this.customGestures.length) return null;
    const wrist = lm[0];
    const scale = dist(lm[0], lm[9]) || 0.001;
    const norm = lm.map(p => ({ x: (p.x - wrist.x) / scale, y: (p.y - wrist.y) / scale }));
    let best = null, bestScore = Infinity;
    for (const g of this.customGestures) {
      let sum = 0;
      for (let i = 0; i < 21; i++) sum += Math.hypot(norm[i].x - g.template[i].x, norm[i].y - g.template[i].y);
      const score = sum / 21;
      if (score < bestScore) { bestScore = score; best = g; }
    }
    if (best && bestScore < 0.35) return { name: best.name, confidence: Math.max(0.6, 1 - bestScore), custom: best };
    return null;
  }

  /** main entry — call once per MediaPipe results frame */
  process(results) {
    const handsData = [];
    const perHandOutput = { Left: null, Right: null };

    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((lm, i) => {
        const handedness = results.multiHandedness[i];
        const label = handedness.label; // "Left" | "Right" (camera perspective, mirrored feed already accounted by MediaPipe)
        const score = handedness.score;
        const states = this.fingerStates(lm, label);
        const palmW = dist(lm[5], lm[17]) || 0.001;
        const center = this.palmCenter(lm);
        this.pushHistory(label, { t: performance.now(), x: center.x, y: center.y });

        handsData.push({ label, lm, states, score, center });

        const custom = this.matchCustomGesture(lm);
        const staticGesture = custom || this.classifyStatic(lm, states, label);
        const pinch = this.detectPinch(lm, label, palmW);
        const swipe = this.detectSwipe(label);

        perHandOutput[label] = {
          label, score, landmarks: lm, states,
          gesture: staticGesture ? staticGesture.name : (pinch.isPinching ? 'pinch_hold' : null),
          confidence: staticGesture ? staticGesture.confidence : score,
          isPinching: pinch.isPinching,
        };

        // priority: two-hand > swipe > pinch event > custom/static
        if (swipe) this._emit(swipe, 0.85, label);
        else if (pinch.event) this._emit(pinch.event, 0.88, label);
        else if (staticGesture) this._emitStable(staticGesture.name, staticGesture.confidence, label);
      });
    } else {
      this.history.Left = []; this.history.Right = [];
      this.stable = { name: null, since: 0, hand: null };
    }

    const twoHand = this.detectTwoHandGestures(handsData);
    if (twoHand) this._emit(twoHand, 0.85, 'Both');

    return perHandOutput;
  }

  _emitStable(name, confidence, hand) {
    const now = performance.now();
    if (this.stable.name === name && this.stable.hand === hand) {
      const heldFor = now - this.stable.since;
      if (heldFor >= this.holdTimeMs && this.lastEmitted !== name + '_hold_flag') {
        this.onGesture('hold_gesture', confidence, { hand, baseGesture: name });
        this.lastEmitted = name + '_hold_flag';
      }
    } else {
      this.stable = { name, since: now, hand };
      this.lastEmitted = null;
    }
    this.onGesture(name, confidence, { hand });
  }

  _emit(name, confidence, hand) {
    this.onGesture(name, confidence, { hand });
  }
}
