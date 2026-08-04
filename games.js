/* =========================================================
   games.js — built-in gesture-controlled mini games
   Each game is a plain object created by a factory function:
     { init(w,h), onResize(w,h), update(dt,pointer), render(ctx),
       onGesture(name,confidence,meta,pointer), onFrame(pointer) }
   pointer = { x, y, visible }  — normalized 0..1 fingertip position
   (already mirror-corrected to match what the player sees).
   GamesModule drives the loop and forwards camera events to
   whichever game is currently loaded.
   ========================================================= */

const GamesModule = {
  canvas: null,
  ctx: null,
  registry: {},          // id -> { name, icon, desc, chips:[...], create() }
  order: [],
  current: null,
  currentId: null,
  running: false,
  rafId: null,
  lastTime: 0,
  pointer: { x: 0.5, y: 0.5, visible: false },
  onScoreChange: null,   // (score) => void
  onStatus: null,        // (text) => void
  onGameOver: null,      // (score) => void
  onGestureSeen: null,   // (name) => void — used by UI to show "live gesture"

  register(id, def) { this.registry[id] = def; this.order.push(id); },

  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width; this._h = rect.height;
    if (this.current && this.current.onResize) this.current.onResize(rect.width, rect.height);
  },

  load(id) {
    this.stop();
    const def = this.registry[id];
    if (!def) return null;
    this.currentId = id;
    this.current = def.create();
    this.resize();
    if (this.current.init) this.current.init(this._w || 600, this._h || 380);
    return def;
  },

  start() {
    if (!this.current || this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((t) => this._loop(t));
  },

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  },

  restart() {
    if (!this.currentId) return;
    this.load(this.currentId);
  },

  _loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.lastTime) / 1000 || 0.016);
    this.lastTime = t;
    const w = this._w || this.canvas.clientWidth, h = this._h || this.canvas.clientHeight;
    if (this.current) {
      if (this.current.update) this.current.update(dt, this.pointer);
      this.ctx.clearRect(0, 0, w, h);
      if (this.current.render) this.current.render(this.ctx, w, h);
    }
    this.rafId = requestAnimationFrame((t2) => this._loop(t2));
  },

  handleGesture(name, confidence, meta) {
    if (this.onGestureSeen) this.onGestureSeen(name);
    if (this.current && this.current.onGesture) this.current.onGesture(name, confidence, meta, this.pointer);
  },

  handleFrame(x, y, visible) {
    this.pointer.x = x; this.pointer.y = y; this.pointer.visible = visible;
    if (this.current && this.current.onFrame) this.current.onFrame(this.pointer);
  },

  setScore(n) { if (this.onScoreChange) this.onScoreChange(n); },
  status(msg) { if (this.onStatus) this.onStatus(msg); },
  gameOver(score) { this.stop(); if (this.onGameOver) this.onGameOver(score); },

  exportCanvas(filename) {
    if (!this.canvas) return;
    try {
      const url = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'gesturectrl-canvas.png';
      a.click();
      this.status('Exported PNG');
    } catch (e) { /* canvas may be tainted; ignore */ }
  },
};

/* helper: simple cooldown gate for discrete triggers coming off a
   continuously-emitting static-pose gesture stream */
function makeGate(ms) {
  let last = 0;
  return () => {
    const now = performance.now();
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

/* =========================================================
   1. GESTURE DRAW — point to draw, palm to lift the pen,
      fist to clear, peace to change color, OK to export.
   ========================================================= */
GamesModule.register('draw', {
  name: 'Gesture Draw',
  icon: '✏️',
  desc: 'Point to paint, palm to lift the pen, fist to clear.',
  chips: ['☝️ Point = Draw', '🖐️ Palm = Pen up', '✊ Fist = Clear', '✌️ Peace = Color', '👌 OK = Export PNG'],
  create() {
    const COLORS = ['#00f0ff', '#b026ff', '#39ff88', '#ffb800', '#ff3b6b', '#ffffff'];
    const clearGate = makeGate(600);
    const colorGate = makeGate(500);
    let w = 600, h = 380;
    let strokes = [];
    let current = null;
    let penDown = false;
    let colorIdx = 0;
    let lastPt = null;

    return {
      init(ww, hh) { w = ww; h = hh; },
      onResize(ww, hh) { w = ww; h = hh; },
      onGesture(name) {
        if (name === 'pointing') penDown = true;
        else if (name === 'open_palm') { penDown = false; current = null; }
        else if (name === 'closed_fist' && clearGate()) { strokes = []; current = null; GamesModule.status('Canvas cleared'); }
        else if (name === 'peace' && colorGate()) { colorIdx = (colorIdx + 1) % COLORS.length; GamesModule.status('Color changed'); }
        else if (name === 'ok_sign' && colorGate()) { GamesModule.exportCanvas('gesturectrl-drawing.png'); }
      },
      onFrame(pointer) {
        if (!pointer.visible) { current = null; lastPt = null; return; }
        const x = pointer.x * w, y = pointer.y * h;
        lastPt = { x, y };
        if (penDown) {
          if (!current) { current = { color: COLORS[colorIdx], size: 5, pts: [{ x, y }] }; strokes.push(current); }
          else current.pts.push({ x, y });
        } else current = null;
      },
      render(ctx) {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (const s of strokes) {
          if (s.pts.length < 2) { continue; }
          ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
          ctx.moveTo(s.pts[0].x, s.pts[0].y);
          for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
          ctx.stroke();
        }
        if (lastPt) {
          ctx.beginPath();
          ctx.fillStyle = penDown ? COLORS[colorIdx] : 'rgba(255,255,255,0.4)';
          ctx.arc(lastPt.x, lastPt.y, penDown ? 6 : 9, 0, Math.PI * 2);
          ctx.fill();
          if (!penDown) { ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.arc(lastPt.x, lastPt.y, 9, 0, Math.PI * 2); ctx.stroke(); }
        }
      },
    };
  },
});

/* =========================================================
   2. FRUIT SLICE — your fingertip is the blade; swipe through
      fruit to slice it. Avoid the bombs. 3 misses = game over.
   ========================================================= */
GamesModule.register('slice', {
  name: 'Fruit Slice',
  icon: '🍉',
  desc: 'Slice flying fruit with your fingertip. Dodge bombs.',
  chips: ['☝️ Fingertip = Blade', '🍇 Slice fruit for points', '💣 Bomb = Game over', '❤️ 3 misses = Game over'],
  create() {
    const EMOJI = ['🍉', '🍊', '🍎', '🍓', '🍍', '🥝', '🍌'];
    let w = 600, h = 380;
    let fruits = [];
    let trail = [];
    let score = 0, lives = 3;
    let spawnTimer = 0;
    let over = false;

    function spawn() {
      const isBomb = Math.random() < 0.14;
      const x = 40 + Math.random() * (w - 80);
      fruits.push({
        x, y: h + 20, r: 24,
        vx: (Math.random() - 0.5) * 90,
        vy: -(420 + Math.random() * 160),
        gravity: 620,
        emoji: isBomb ? '💣' : EMOJI[(Math.random() * EMOJI.length) | 0],
        bomb: isBomb, sliced: false, rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 3,
      });
    }

    function segHitsCircle(p0, p1, c, r) {
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((c.x - p0.x) * dx + (c.y - p0.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = p0.x + dx * t, py = p0.y + dy * t;
      return Math.hypot(px - c.x, py - c.y) < r;
    }

    return {
      init(ww, hh) { w = ww; h = hh; },
      onResize(ww, hh) { w = ww; h = hh; },
      onFrame(pointer) {
        if (over) return;
        if (!pointer.visible) { trail = []; return; }
        const pt = { x: pointer.x * w, y: pointer.y * h };
        trail.push(pt);
        if (trail.length > 6) trail.shift();
        if (trail.length >= 2) {
          const p0 = trail[trail.length - 2], p1 = trail[trail.length - 1];
          const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (moved > 4) {
            for (const f of fruits) {
              if (f.sliced) continue;
              if (segHitsCircle(p0, p1, f, f.r)) {
                f.sliced = true;
                if (f.bomb) { over = true; GamesModule.status('💥 Sliced a bomb!'); GamesModule.gameOver(score); }
                else { score += 10; GamesModule.setScore(score); }
              }
            }
          }
        }
      },
      update(dt) {
        if (over) return;
        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawn(); spawnTimer = 0.55 + Math.random() * 0.5; }
        for (const f of fruits) {
          if (f.sliced) continue;
          f.vy += f.gravity * dt;
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
          if (f.y - f.r > h && f.vy > 0) {
            f.sliced = true; // remove
            if (!f.bomb) {
              lives -= 1;
              GamesModule.status(`Missed! ${lives} lives left`);
              if (lives <= 0) { over = true; GamesModule.gameOver(score); }
            }
          }
        }
        fruits = fruits.filter(f => !(f.sliced && (f.y - f.r > h || f.bomb)));
      },
      render(ctx) {
        ctx.font = '38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const f of fruits) {
          if (f.sliced) continue;
          ctx.save();
          ctx.translate(f.x, f.y); ctx.rotate(f.rot);
          ctx.fillText(f.emoji, 0, 0);
          ctx.restore();
        }
        if (trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(trail[0].x, trail[0].y);
          for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = 'rgba(0,240,255,0.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
        }
        ctx.font = '13px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#ff3b6b';
        ctx.fillText('❤'.repeat(Math.max(0, lives)), 12, 22);
        if (over) {
          ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
          ctx.fillText(`Game Over — Score ${score}`, w / 2, h / 2);
        }
      },
    };
  },
});

/* =========================================================
   3. WHACK-A-MOLE — pinch on a mole's hole to whack it.
      Golden moles = bonus, bomb holes cost points. 45s round.
   ========================================================= */
GamesModule.register('mole', {
  name: 'Whack-a-Mole',
  icon: '🐹',
  desc: 'Aim your fingertip at a hole and pinch to whack.',
  chips: ['☝️ Fingertip = Aim', '🤏 Pinch = Whack', '⭐ Gold mole = +50', '💣 Bomb hole = -20', '⏱️ 45s round'],
  create() {
    const COLS = 3, ROWS = 3;
    let w = 600, h = 380;
    let holes = [];
    let score = 0, timeLeft = 45, over = false;
    let spawnTimer = 0;
    let flashAt = -1, flashUntil = 0;

    function layout() {
      holes = [];
      const padX = w * 0.12, padY = h * 0.15;
      const cw = (w - padX * 2) / COLS, ch = (h - padY * 2) / ROWS;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          holes.push({ x: padX + cw * (c + 0.5), y: padY + ch * (r + 0.5), r: Math.min(cw, ch) * 0.32, up: false, kind: null, until: 0 });
        }
      }
    }

    function popRandom() {
      const idle = holes.filter(hh => !hh.up);
      if (!idle.length) return;
      const hole = idle[(Math.random() * idle.length) | 0];
      const roll = Math.random();
      hole.kind = roll < 0.15 ? 'gold' : roll < 0.3 ? 'bomb' : 'mole';
      hole.up = true;
      hole.until = performance.now() + (900 + Math.random() * 700);
    }

    return {
      init(ww, hh) { w = ww; h = hh; layout(); },
      onResize(ww, hh) { w = ww; h = hh; layout(); },
      onGesture(name, confidence, meta, pointer) {
        if (over || name !== 'pinch') return;
        if (!pointer.visible) return;
        const px = pointer.x * w, py = pointer.y * h;
        for (const hole of holes) {
          if (!hole.up) continue;
          if (Math.hypot(px - hole.x, py - hole.y) < hole.r * 1.15) {
            flashAt = holes.indexOf(hole); flashUntil = performance.now() + 150;
            if (hole.kind === 'gold') { score += 50; GamesModule.status('⭐ Golden whack! +50'); }
            else if (hole.kind === 'bomb') { score = Math.max(0, score - 20); GamesModule.status('💣 Ouch! -20'); }
            else { score += 10; GamesModule.status('Whacked! +10'); }
            GamesModule.setScore(score);
            hole.up = false; hole.kind = null;
            break;
          }
        }
      },
      update(dt) {
        if (over) return;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; GamesModule.gameOver(score); return; }
        spawnTimer -= dt;
        if (spawnTimer <= 0) { popRandom(); spawnTimer = 0.5 + Math.random() * 0.5; }
        const now = performance.now();
        for (const hole of holes) if (hole.up && now > hole.until) { hole.up = false; hole.kind = null; }
      },
      render(ctx) {
        const now = performance.now();
        holes.forEach((hole, i) => {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.ellipse(hole.x, hole.y + hole.r * 0.55, hole.r, hole.r * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
          if (hole.up) {
            ctx.font = `${hole.r * 1.7}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const emoji = hole.kind === 'gold' ? '⭐' : hole.kind === 'bomb' ? '💣' : '🐹';
            ctx.fillText(emoji, hole.x, hole.y - hole.r * 0.15);
          }
          if (i === flashAt && now < flashUntil) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(0,240,255,0.9)'; ctx.lineWidth = 3;
            ctx.arc(hole.x, hole.y, hole.r * 1.3, 0, Math.PI * 2); ctx.stroke();
          }
        });
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
        ctx.fillText(`⏱ ${Math.ceil(timeLeft)}s`, 12, 22);
        if (over) {
          ctx.textAlign = 'center'; ctx.font = '20px sans-serif';
          ctx.fillText(`Time's up — Score ${score}`, w / 2, h / 2);
        }
      },
    };
  },
});

/* =========================================================
   4. GESTURE BIRD — hold an open palm to flap upward, weave
      through the pipes. Closed fist / no hand = gravity wins.
   ========================================================= */
GamesModule.register('bird', {
  name: 'Gesture Bird',
  icon: '🐦',
  desc: 'Flap through the pipes — open palm to rise.',
  chips: ['🖐️ Open Palm = Flap', '🚫 Nothing = Fall', '🚧 Touching a pipe ends the run'],
  create() {
    let w = 600, h = 380;
    let birdY, vy, pipes, score, over, spawnTimer;
    const flapGate = makeGate(220);

    function reset(ww, hh) {
      w = ww; h = hh;
      birdY = h / 2; vy = 0; pipes = []; score = 0; over = false; spawnTimer = 0;
    }

    function spawnPipe() {
      const gap = Math.max(120, h * 0.32);
      const margin = 40;
      const centerY = margin + Math.random() * (h - margin * 2 - gap) + gap / 2;
      pipes.push({ x: w + 30, w: 46, gapY: centerY, gap, passed: false });
    }

    return {
      init(ww, hh) { reset(ww, hh); },
      onResize(ww, hh) { w = ww; h = hh; },
      onGesture(name) {
        if (over) return;
        if (name === 'open_palm' && flapGate()) vy = -260;
      },
      update(dt) {
        if (over) return;
        vy += 620 * dt;
        birdY += vy * dt;
        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawnPipe(); spawnTimer = 1.5; }
        for (const p of pipes) p.x -= 170 * dt;
        pipes = pipes.filter(p => p.x > -60);

        const birdX = w * 0.28, birdR = 14;
        if (birdY - birdR < 0 || birdY + birdR > h) { over = true; GamesModule.gameOver(score); return; }
        for (const p of pipes) {
          if (!p.passed && p.x + p.w < birdX) { p.passed = true; score += 1; GamesModule.setScore(score); }
          const withinX = birdX + birdR > p.x && birdX - birdR < p.x + p.w;
          if (withinX) {
            const topEdge = p.gapY - p.gap / 2, botEdge = p.gapY + p.gap / 2;
            if (birdY - birdR < topEdge || birdY + birdR > botEdge) { over = true; GamesModule.gameOver(score); return; }
          }
        }
      },
      render(ctx) {
        const birdX = w * 0.28;
        ctx.fillStyle = 'rgba(0,240,255,0.9)';
        for (const p of pipes) {
          const topEdge = p.gapY - p.gap / 2, botEdge = p.gapY + p.gap / 2;
          ctx.fillRect(p.x, 0, p.w, topEdge);
          ctx.fillRect(p.x, botEdge, p.w, h - botEdge);
        }
        ctx.save();
        ctx.translate(birdX, birdY);
        ctx.rotate(Math.max(-0.5, Math.min(0.9, vy / 500)));
        ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐦', 0, 0);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '16px monospace';
        ctx.fillText(String(score), 14, 26);
        if (over) {
          ctx.textAlign = 'center'; ctx.font = '20px sans-serif';
          ctx.fillText(`Game Over — Score ${score}`, w / 2, h / 2);
        }
      },
    };
  },
});

/* =========================================================
   5. ROCK · PAPER · SCISSORS — throw your gesture when the
      countdown hits "Shoot!" (✊ rock · 🖐️ paper · ✌️ scissors).
   ========================================================= */
GamesModule.register('rps', {
  name: 'Rock · Paper · Scissors',
  icon: '✊',
  desc: 'Throw a pose when the countdown says Shoot!',
  chips: ['✊ Fist = Rock', '🖐️ Palm = Paper', '✌️ Peace = Scissors', 'Throw right on "Shoot!"'],
  create() {
    const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const GESTURE_TO_THROW = { closed_fist: 'rock', open_palm: 'paper', peace: 'scissors' };
    const LABEL = { rock: '✊ Rock', paper: '🖐️ Paper', scissors: '✌️ Scissors' };
    let w = 600, h = 380;
    let wins = 0, losses = 0, ties = 0;
    let phase = 'countdown'; // countdown -> shoot -> result
    let phaseT = 0;
    let countdownStep = 0;
    const COUNTDOWN_WORDS = ['Rock…', 'Paper…', 'Scissors…', 'Shoot!'];
    let playerThrow = null, cpuThrow = null, resultText = '';

    function beginRound() {
      phase = 'countdown'; phaseT = 0; countdownStep = 0; playerThrow = null; cpuThrow = null; resultText = '';
    }

    return {
      init(ww, hh) { w = ww; h = hh; beginRound(); },
      onResize(ww, hh) { w = ww; h = hh; },
      onGesture(name) {
        if (phase !== 'shoot' || playerThrow) return;
        const t = GESTURE_TO_THROW[name];
        if (!t) return;
        playerThrow = t;
        cpuThrow = ['rock', 'paper', 'scissors'][(Math.random() * 3) | 0];
        if (playerThrow === cpuThrow) { ties++; resultText = "Tie!"; }
        else if (BEATS[playerThrow] === cpuThrow) { wins++; resultText = 'You win!'; }
        else { losses++; resultText = 'CPU wins!'; }
        GamesModule.setScore(wins);
        GamesModule.status(`${resultText} (${wins}W / ${losses}L / ${ties}T)`);
        phase = 'result'; phaseT = 0;
      },
      update(dt) {
        phaseT += dt;
        if (phase === 'countdown') {
          if (phaseT > 0.55) {
            phaseT = 0; countdownStep++;
            if (countdownStep >= COUNTDOWN_WORDS.length) phase = 'shoot';
          }
        } else if (phase === 'shoot') {
          if (phaseT > 1.1 && !playerThrow) {
            // no throw detected in time
            playerThrow = 'rock'; cpuThrow = ['rock', 'paper', 'scissors'][(Math.random() * 3) | 0];
            resultText = 'No gesture seen — defaulted to Rock';
            GamesModule.status(resultText);
            phase = 'result'; phaseT = 0;
          }
        } else if (phase === 'result') {
          if (phaseT > 1.8) beginRound();
        }
      },
      render(ctx) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (phase === 'countdown') {
          ctx.font = '30px "Orbitron", sans-serif'; ctx.fillStyle = '#00f0ff';
          ctx.fillText(COUNTDOWN_WORDS[Math.min(countdownStep, COUNTDOWN_WORDS.length - 1)], w / 2, h / 2);
        } else if (phase === 'shoot') {
          ctx.font = '34px "Orbitron", sans-serif'; ctx.fillStyle = '#39ff88';
          ctx.fillText('SHOOT! ✊🖐️✌️', w / 2, h / 2);
          ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText('throw your pose now', w / 2, h / 2 + 34);
        } else {
          ctx.font = '46px sans-serif';
          ctx.fillText(LABEL[playerThrow].split(' ')[0], w / 2 - 70, h / 2 - 10);
          ctx.fillText(LABEL[cpuThrow].split(' ')[0], w / 2 + 70, h / 2 - 10);
          ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText('you', w / 2 - 70, h / 2 + 34);
          ctx.fillText('cpu', w / 2 + 70, h / 2 + 34);
          ctx.font = '20px "Orbitron", sans-serif'; ctx.fillStyle = '#ffb800';
          ctx.fillText(resultText, w / 2, h / 2 - 70);
        }
        ctx.textAlign = 'left'; ctx.font = '12px monospace'; ctx.fillStyle = '#fff';
        ctx.fillText(`W ${wins} · L ${losses} · T ${ties}`, 12, 22);
      },
    };
  },
});
