/* =========================================================
   script.js — app bootstrap: nav, UI binding, dashboard glue
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- particle background ---------------- */
  function initParticles() {
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let particles = [];
    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
    function spawn() {
      particles = Array.from({ length: Math.min(70, Math.floor(innerWidth / 22)) }, () => ({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.6 + 0.4,
        c: Math.random() > 0.5 ? '0,240,255' : '176,38,255',
      }));
    }
    resize(); spawn();
    window.addEventListener('resize', () => { resize(); });
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},0.5)`;
        ctx.fill();
      }
      requestAnimationFrame(loop);
    }
    loop();
  }

  /* ---------------- navigation ---------------- */
  function initNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => goToView(item.dataset.view));
    });
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => goToView(btn.dataset.nav));
    });
  }
  function goToView(view) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    if (view === 'dashboard') moveStageTo('cameraWrapDash', 'cameraIdleDash');
    else if (view === 'camera') moveStageTo('cameraWrapFull', 'cameraIdleFull');
    else if (view === 'games') moveStageTo('cameraWrapGames', 'cameraIdleGames');
    else if (GamesModule.running) GamesModule.stop(); // pause game loop when leaving the Games tab
  }

  function moveStageTo(wrapId, idleId) {
    if (activeWrap === wrapId) return;
    const wrap = document.getElementById(wrapId);
    const idle = document.getElementById(idleId);
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    idle.insertAdjacentElement('afterend', overlay);
    idle.insertAdjacentElement('afterend', video);
    activeWrap = wrapId;
    document.getElementById('cameraIdleDash').style.display = (CameraModule.running && activeWrap === 'cameraWrapDash') ? 'none' : 'flex';
    document.getElementById('cameraIdleFull').style.display = (CameraModule.running && activeWrap === 'cameraWrapFull') ? 'none' : 'flex';
    document.getElementById('cameraIdleGames').style.display = (CameraModule.running && activeWrap === 'cameraWrapGames') ? 'none' : 'flex';
  }

  /* ---------------- dashboard / log state ---------------- */
  const logEntries = [];
  function pushLog(gesture, mapping, meta) {
    const el = document.getElementById('actionLog');
    const row = document.createElement('div');
    row.className = 'log-row action';
    const time = new Date().toLocaleTimeString();
    const actionText = mapping ? `${GESTURE_META[gesture]?.name || gesture} → ${mapping.label}` : `${GESTURE_META[gesture]?.name || gesture} (unmapped)`;
    row.innerHTML = `<span class="t">${time}</span><span class="g">${actionText}</span>`;
    el.prepend(row);
    logEntries.push(row);
    while (logEntries.length > 60) { const r = logEntries.pop(); r.remove(); }
    document.getElementById('logCount').textContent = `${logEntries.length} events`;
    document.getElementById('statAction').textContent = mapping ? mapping.label : '—';
  }

  function pushRelayLog(msg) {
    const el = document.getElementById('relayLog');
    if (!el) return;
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span class="t">${new Date().toLocaleTimeString()}</span><span>${msg}</span>`;
    el.prepend(row);
    while (el.children.length > 80) el.lastChild.remove();
  }

  /* ---------------- gesture legend + mapping table + gaming preset ---------------- */
  function renderGestureLegend() {
    const el = document.getElementById('gestureLegend');
    el.innerHTML = Object.entries(GESTURE_META).map(([key, m]) =>
      `<div class="gesture-chip" data-key="${key}"><span class="emoji">${m.emoji}</span><span>${m.name}</span></div>`
    ).join('');
  }

  function highlightLegend(gestureName) {
    document.querySelectorAll('.gesture-chip').forEach(c => c.classList.toggle('active', c.dataset.key === gestureName));
  }

  const KEY_OPTIONS = ['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape','ShiftLeft','Equal','Minus',
    'KeyA','KeyB','KeyC','KeyD','KeyE','KeyF','KeyG','KeyH','KeyI','KeyJ','KeyK','KeyL','KeyM','KeyN','KeyO','KeyP',
    'KeyQ','KeyR','KeyS','KeyT','KeyU','KeyV','KeyW','KeyX','KeyY','KeyZ','Digit0','Digit1','Digit2','Digit3'];
  const MOUSE_OPTIONS = ['move','click','rightclick','dblclick'];
  const SYSTEM_OPTIONS = ['fullscreen'];

  function renderMappingTable() {
    const body = document.getElementById('mapTableBody');
    body.innerHTML = Object.entries(GESTURE_META).map(([key, meta]) => {
      const m = Settings.map[key] || { type: 'key', value: 'Space', label: '', enabled: true };
      const typeOpts = ['key', 'mouse', 'system'].map(t => `<option value="${t}" ${m.type === t ? 'selected' : ''}>${t}</option>`).join('');
      return `<tr data-key="${key}">
        <td>${meta.emoji} ${meta.name}</td>
        <td><select class="map-type">${typeOpts}</select></td>
        <td><select class="map-value"></select></td>
        <td><span class="switch"><input type="checkbox" class="map-enabled" ${m.enabled !== false ? 'checked' : ''}><span class="slider-tog"></span></span></td>
      </tr>`;
    }).join('');

    body.querySelectorAll('tr').forEach(row => {
      const key = row.dataset.key;
      const m = Settings.map[key];
      const typeSel = row.querySelector('.map-type');
      const valueSel = row.querySelector('.map-value');
      function fillValues() {
        const opts = typeSel.value === 'key' ? KEY_OPTIONS : typeSel.value === 'mouse' ? MOUSE_OPTIONS : SYSTEM_OPTIONS;
        valueSel.innerHTML = opts.map(o => `<option value="${o}" ${m.value === o ? 'selected' : ''}>${o}</option>`).join('');
      }
      fillValues();
      typeSel.addEventListener('change', () => { m.type = typeSel.value; fillValues(); m.value = valueSel.value; Settings.saveMap(); });
      valueSel.addEventListener('change', () => { m.value = valueSel.value; Settings.saveMap(); });
      row.querySelector('.map-enabled').addEventListener('change', (e) => { m.enabled = e.target.checked; Settings.saveMap(); });
    });
  }

  function renderGamingPreset() {
    const el = document.getElementById('gamingPresetList');
    el.innerHTML = Object.entries(GAMING_PRESET).map(([key, m]) => {
      const meta = GESTURE_META[key];
      return `<div class="gesture-chip"><span class="emoji">${meta.emoji}</span><span>${meta.name} → ${m.label}</span></div>`;
    }).join('');
  }

  /* ---------------- trainer UI ---------------- */
  function renderSavedGestures() {
    const el = document.getElementById('savedGesturesList');
    document.getElementById('savedCount').textContent = Trainer.saved.length;
    if (!Trainer.saved.length) { el.innerHTML = '<p class="muted" style="font-size:12px;">No custom gestures yet. Record one to see it here.</p>'; return; }
    el.innerHTML = Trainer.saved.map(g => `
      <div class="saved-gesture-row">
        <span>${g.name}${g.key ? ` <span class="badge mono">${g.key}</span>` : ''}</span>
        <button class="btn btn-sm btn-danger" data-id="${g.id}">Delete</button>
      </div>`).join('');
    el.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        Trainer.remove(btn.dataset.id);
        Trainer.syncToEngine(CameraModule.engine);
        renderSavedGestures();
      });
    });
  }

  /* ---------------- camera wiring ---------------- */
  let activeWrap = 'cameraWrapDash';

  function setDot(id, on) {
    const el = document.getElementById(id);
    el.classList.toggle('on', on);
    el.classList.toggle('off', !on);
  }

  function initCamera() {
    CameraModule.init();
    CameraModule.showSkeleton = Settings.get('showSkeleton');
    CameraModule.mirror = Settings.get('mirror');
    Trainer.syncToEngine(CameraModule.engine);

    CameraModule.onStatus = (running) => {
      setDot('dotCamera', running);
      document.getElementById('cameraIdleDash').style.display = (running && activeWrap === 'cameraWrapDash') ? 'none' : 'flex';
      document.getElementById('cameraIdleFull').style.display = (running && activeWrap === 'cameraWrapFull') ? 'none' : 'flex';
      document.getElementById('cameraIdleGames').style.display = (running && activeWrap === 'cameraWrapGames') ? 'none' : 'flex';
      document.getElementById('statCamera').textContent = running ? 'Live' : 'Offline';
      document.getElementById('statCamera').className = 'v ' + (running ? 'on' : 'off');
      document.getElementById('btnQuickStart').textContent = running ? '■ Stop Camera' : '▶ Start Camera';
      document.getElementById('btnToggleCamera').textContent = running ? '■ Stop Camera' : '▶ Start Camera';
      const gameCamBtn = document.getElementById('btnGameCamStart');
      if (gameCamBtn) gameCamBtn.textContent = running ? '■ Stop Camera' : '▶ Start Camera';
      const gameCamBadge = document.getElementById('gameCamBadge');
      if (gameCamBadge) { gameCamBadge.textContent = running ? 'Camera live' : 'Camera off'; gameCamBadge.className = 'badge ' + (running ? 'connected' : ''); }
      if (!running) { setDot('dotHand', false); GamesModule.handleFrame(0.5, 0.5, false); }
    };

    CameraModule.onFps = (fps) => {
      document.getElementById('fpsCounter').textContent = fps;
      document.getElementById('fpsCounter2').textContent = fps;
      const f3 = document.getElementById('fpsCounter3'); if (f3) f3.textContent = fps;
      document.getElementById('statFps').textContent = fps;
    };

    CameraModule.onResults = (perHandOutput) => {
      const left = perHandOutput.Left, right = perHandOutput.Right;
      const count = (left ? 1 : 0) + (right ? 1 : 0);
      document.getElementById('handsCounter').textContent = count;
      document.getElementById('handsCounter2').textContent = count;
      const h3 = document.getElementById('handsCounter3'); if (h3) h3.textContent = count;
      setDot('dotHand', count > 0);

      const leftTxt = left ? `Detected (${Math.round(left.score * 100)}%)` : 'Not detected';
      const rightTxt = right ? `Detected (${Math.round(right.score * 100)}%)` : 'Not detected';
      document.getElementById('statLeft').textContent = leftTxt;
      document.getElementById('statRight').textContent = rightTxt;
      document.getElementById('camLeft').textContent = leftTxt;
      document.getElementById('camRight').textContent = rightTxt;
      document.getElementById('statLeft').className = 'v ' + (left ? 'on' : '');
      document.getElementById('statRight').className = 'v ' + (right ? 'on' : '');

      const primary = right || left;
      if (primary && primary.gesture) {
        const meta = GESTURE_META[primary.gesture];
        document.getElementById('statGesture').textContent = meta ? meta.name : primary.gesture;
        document.getElementById('statConf').textContent = Math.round(primary.confidence * 100) + '%';
      }

      // feed the games engine a continuous fingertip position (index tip, mirror-corrected)
      const lm = CameraModule.lastLmByHand && (CameraModule.lastLmByHand.Right || CameraModule.lastLmByHand.Left);
      if (lm) {
        const tip = lm[8];
        const px = CameraModule.mirror ? 1 - tip.x : tip.x;
        GamesModule.handleFrame(px, tip.y, true);
      } else {
        GamesModule.handleFrame(0.5, 0.5, false);
      }
    };

    CameraModule.onGestureEvent = (name, confidence, meta) => {
      const gmeta = GESTURE_META[name];
      if (gmeta) {
        for (const [nameEl, confEl] of [['gestureBannerName', 'gestureBannerConf'], ['gestureBannerName2', 'gestureBannerConf2'], ['gestureBannerName3', 'gestureBannerConf3']]) {
          const nEl = document.getElementById(nameEl), cEl = document.getElementById(confEl);
          if (!nEl) continue;
          nEl.textContent = `${gmeta.emoji} ${gmeta.name}`;
          cEl.textContent = Math.round(confidence * 100) + '%';
        }
        document.getElementById('gestureBanner').style.display = 'flex';
        document.getElementById('gestureBanner2').style.display = 'flex';
        const b3 = document.getElementById('gestureBanner3'); if (b3) b3.style.display = 'flex';
        const liveG = document.getElementById('gameLiveGesture'); if (liveG) liveG.textContent = `${gmeta.emoji} ${gmeta.name}`;
        highlightLegend(name);
        setTimeout(() => highlightLegend(null), 900);
      }
      GamesModule.handleGesture(name, confidence, meta);
      Controls.handleGesture(name, confidence, meta);
    };

    Controls.onAction = (gestureName, mapping) => pushLog(gestureName, mapping);
  }

  async function populateCameraDevices() {
    const sel = document.getElementById('cameraSelect');
    try {
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
    } catch (e) { /* permission not yet granted; list may be limited */ }
    const devices = await CameraModule.listDevices();
    sel.innerHTML = devices.length
      ? devices.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Camera ' + (i + 1)}</option>`).join('')
      : '<option value="">Default camera</option>';
    sel.addEventListener('change', () => { CameraModule.deviceId = sel.value || null; });
  }

  async function toggleCamera() {
    if (CameraModule.running) { CameraModule.stop(); return; }
    try {
      await CameraModule.start();
    } catch (e) {
      alert('Could not access the camera: ' + e.message + '\nCheck your browser permissions.');
    }
  }

  /* ---------------- settings binding ---------------- */
  function initSettingsUI() {
    const s = Settings.data;

    document.querySelectorAll('#themeTabs .pill-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.theme === s.theme);
      tab.addEventListener('click', () => {
        document.querySelectorAll('#themeTabs .pill-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.body.dataset.theme = tab.dataset.theme;
        Settings.set('theme', tab.dataset.theme);
      });
    });
    document.body.dataset.theme = s.theme;

    document.querySelectorAll('#handTabs .pill-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.hand === s.handMode);
      tab.addEventListener('click', () => {
        document.querySelectorAll('#handTabs .pill-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.body.dataset.hand = tab.dataset.hand;
        Settings.set('handMode', tab.dataset.hand);
      });
    });
    document.body.dataset.hand = s.handMode;

    const bind = (id, key, evt, prop, transform) => {
      const el = document.getElementById(id);
      el[prop] = s[key];
      el.addEventListener(evt, () => {
        const v = transform ? transform(el.value ?? el.checked) : (el.type === 'checkbox' ? el.checked : el.value);
        Settings.set(key, v);
        return v;
      });
      return el;
    };

    document.getElementById('settingEnableGestures').checked = s.enableGestures;
    document.getElementById('settingEnableGestures').addEventListener('change', e => Settings.set('enableGestures', e.target.checked));

    document.getElementById('settingShowSkeleton').checked = s.showSkeleton;
    document.getElementById('settingShowSkeleton').addEventListener('change', e => { Settings.set('showSkeleton', e.target.checked); CameraModule.showSkeleton = e.target.checked; });

    document.getElementById('settingMirror').checked = s.mirror;
    document.getElementById('settingMirror').addEventListener('change', e => { Settings.set('mirror', e.target.checked); CameraModule.toggleMirror(e.target.checked); syncMirrorButtons(); });

    const fpsLimit = document.getElementById('fpsLimit');
    fpsLimit.value = s.fpsLimit;
    document.getElementById('fpsLimitVal').textContent = s.fpsLimit;
    fpsLimit.addEventListener('input', () => { document.getElementById('fpsLimitVal').textContent = fpsLimit.value; Settings.set('fpsLimit', +fpsLimit.value); });

    const sensitivity = document.getElementById('sensitivity');
    sensitivity.value = s.sensitivity;
    document.getElementById('sensitivityVal').textContent = s.sensitivity;
    sensitivity.addEventListener('input', () => {
      document.getElementById('sensitivityVal').textContent = sensitivity.value;
      Settings.set('sensitivity', +sensitivity.value);
      CameraModule.engine.updateSettings({ sensitivity: +sensitivity.value });
    });

    const holdTime = document.getElementById('holdTime');
    holdTime.value = s.holdTimeMs;
    document.getElementById('holdTimeVal').textContent = s.holdTimeMs;
    holdTime.addEventListener('input', () => {
      document.getElementById('holdTimeVal').textContent = holdTime.value;
      Settings.set('holdTimeMs', +holdTime.value);
      CameraModule.engine.updateSettings({ holdTimeMs: +holdTime.value });
    });

    document.getElementById('btnResetAll').addEventListener('click', () => {
      if (!confirm('Reset all settings and gesture mappings to defaults?')) return;
      Settings.resetAll();
      location.reload();
    });
  }

  function syncMirrorButtons() {
    const on = Settings.get('mirror');
    document.getElementById('btnMirror').textContent = `⇋ Mirror: ${on ? 'On' : 'Off'}`;
  }

  /* ---------------- mouse control tab ---------------- */
  function initMouseTab() {
    const enable = document.getElementById('mouseEnable');
    enable.addEventListener('change', () => Controls.setMouseEnabled(enable.checked));
    const smoothing = document.getElementById('cursorSmoothing');
    smoothing.value = Settings.get('cursorSmoothing');
    smoothing.addEventListener('input', () => { Controls.cursorSmoothing = +smoothing.value; Settings.set('cursorSmoothing', +smoothing.value); });
    const pinch = document.getElementById('pinchThreshold');
    pinch.value = Settings.get('pinchThreshold');
    pinch.addEventListener('input', () => { Settings.set('pinchThreshold', +pinch.value); CameraModule.engine.updateSettings({ pinchThreshold: +pinch.value }); });
  }

  /* ---------------- trainer tab ---------------- */
  function initTrainerTab() {
    renderSavedGestures();
    document.getElementById('btnRecordGesture').addEventListener('click', () => {
      const name = document.getElementById('trainerName').value;
      const key = document.getElementById('trainerKey').value;
      const statusEl = document.getElementById('trainerStatus');
      const progEl = document.getElementById('trainerProgress');
      if (!CameraModule.running) { alert('Start the camera first (Camera tab).'); return; }
      statusEl.textContent = 'Recording — hold your pose steady...';
      Trainer.record(name, key, {
        getLandmarks: () => CameraModule.latestLandmarks,
        onProgress: (pct, seen) => { progEl.textContent = pct + '%'; if (!seen) statusEl.textContent = 'No hand detected — show your hand to the camera'; },
        onDone: (g) => {
          statusEl.textContent = `Saved "${g.name}"`;
          Trainer.syncToEngine(CameraModule.engine);
          renderSavedGestures();
          document.getElementById('trainerName').value = '';
          document.getElementById('trainerKey').value = '';
        },
        onError: (msg) => { statusEl.textContent = msg; },
      });
    });
    document.getElementById('btnExportModel').addEventListener('click', () => Trainer.exportModel());
    document.getElementById('btnImportModel').addEventListener('click', () => document.getElementById('importModelFile').click());
    document.getElementById('importModelFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      Trainer.importModel(file, (err, count) => {
        if (err) { alert('Invalid model file.'); return; }
        Trainer.syncToEngine(CameraModule.engine);
        renderSavedGestures();
        alert(`Imported ${count} custom gesture(s).`);
      });
    });
  }

  /* ---------------- connect tab ---------------- */
  function initConnectTab() {
    document.getElementById('channelName').value = Settings.get('channelName');
    document.getElementById('channelName').addEventListener('change', (e) => {
      Settings.set('channelName', e.target.value);
      Broadcaster.init(e.target.value);
    });
    document.getElementById('btnOpenReceiver').addEventListener('click', () => window.open('receiver.html', '_blank'));
    document.getElementById('btnPingChannel').addEventListener('click', () => {
      Broadcaster.send({ gesture: 'ping', actionType: 'system', action: 'ping', label: 'Ping', confidence: 1, hand: 'None' });
    });
    document.getElementById('btnCheckExt').addEventListener('click', () => Broadcaster._pingExtension());

    Broadcaster.onLog = pushRelayLog;
    Broadcaster.onMessage((evt) => {
      if (evt.type === 'ext-status') {
        const badge = document.getElementById('badgeExt');
        badge.textContent = evt.connected ? 'Connected' : 'Not detected';
        badge.className = 'badge ' + (evt.connected ? 'connected' : 'disconnected');
        document.getElementById('statExt').textContent = evt.connected ? 'Connected' : 'Not installed';
        setDot('dotChannel', evt.connected || Broadcaster.isChannelReady());
        if (evt.connected) document.getElementById('statSite').textContent = Broadcaster.connectedSite || 'Active tab';
      }
    });
  }

  /* ---------------- gaming preset button ---------------- */
  function initGamingTab() {
    renderGamingPreset();
    document.getElementById('btnApplyGamingPreset').addEventListener('click', () => {
      Settings.applyPreset(GAMING_PRESET);
      renderMappingTable();
      alert('Gaming preset applied! Check the Gesture Map tab to review bindings.');
    });
  }

  /* ---------------- games tab ---------------- */
  const EXTERNAL_GAMES = [
    { name: 'Fruit Slasher', site: 'fruit-slasher.pages.dev', url: 'https://fruit-slasher.pages.dev', desc: 'Fruit-Ninja-style slicing with bare-hand webcam tracking (MediaPipe).', icon: '🍉' },
    { name: "Pug's Hunt", site: 'pugshunt.com', url: 'https://pugshunt.com', desc: 'Retro webcam shooter — point to aim, pinch to fire.', icon: '🎯' },
    { name: 'Motion Arcade', site: 'motionarcade.app', url: 'https://motionarcade.app', desc: 'A small arcade of hands-and-body webcam cabinets (Pong and more).', icon: '🕹️' },
    { name: 'Motions', site: 'motions.games', url: 'https://motions.games', desc: 'A catalog of camera-based motion, pose & gesture games.', icon: '🎮' },
    { name: 'itch.io — webcam tag', site: 'itch.io/games/html5/tag-webcam', url: 'https://itch.io/games/html5/tag-webcam', desc: 'Browse community-made HTML5 games tagged "webcam".', icon: '🗂️' },
  ];

  function initGamesTab() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    GamesModule.init(canvas);

    const picker = document.getElementById('gamePicker');
    picker.innerHTML = GamesModule.order.map(id => {
      const g = GamesModule.registry[id];
      return `<div class="game-card" data-id="${id}"><div class="icon">${g.icon}</div><div class="name">${g.name}</div><div class="desc">${g.desc}</div></div>`;
    }).join('');

    const overlay = document.getElementById('gameOverlayMsg');
    const overlayTitle = document.getElementById('gameOverlayTitle');
    const overlaySub = document.getElementById('gameOverlaySub');
    const titleEl = document.getElementById('gameTitle');
    const scoreBadge = document.getElementById('gameScoreBadge');
    const instructionsEl = document.getElementById('gameInstructions');
    const toggleBtn = document.getElementById('btnGameToggle');
    const metaEl = document.getElementById('gameMeta');

    function selectGame(id) {
      const def = GamesModule.load(id);
      if (!def) return;
      picker.querySelectorAll('.game-card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
      titleEl.textContent = def.name;
      scoreBadge.textContent = 'Score 0';
      instructionsEl.innerHTML = (def.chips || []).map(c => `<span class="chip">${c}</span>`).join('');
      overlay.classList.remove('hidden');
      overlayTitle.textContent = `${def.icon} ${def.name}`;
      overlaySub.textContent = CameraModule.running ? 'Ready — press Start Game' : 'Start your camera on the right, then press Start Game';
      toggleBtn.disabled = false;
      toggleBtn.textContent = '▶ Start Game';
      metaEl.textContent = 'Ready';
    }

    picker.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => selectGame(card.dataset.id));
    });

    GamesModule.onScoreChange = (n) => { scoreBadge.textContent = `Score ${n}`; };
    GamesModule.onStatus = (msg) => { metaEl.textContent = msg; };
    GamesModule.onGestureSeen = () => {};
    GamesModule.onGameOver = (score) => {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = `Game Over — Score ${score}`;
      overlaySub.textContent = 'Press Restart to play again.';
      toggleBtn.textContent = '▶ Start Game';
      metaEl.textContent = `Final score: ${score}`;
    };

    toggleBtn.addEventListener('click', () => {
      if (!GamesModule.current) return;
      if (GamesModule.running) {
        GamesModule.stop();
        toggleBtn.textContent = '▶ Start Game';
      } else {
        if (!CameraModule.running) { alert('Start the camera first (button on the right).'); return; }
        overlay.classList.add('hidden');
        GamesModule.start();
        toggleBtn.textContent = '⏸ Pause Game';
        metaEl.textContent = 'Playing';
      }
    });

    document.getElementById('btnGameReset').addEventListener('click', () => {
      if (!GamesModule.currentId) return;
      GamesModule.restart();
      scoreBadge.textContent = 'Score 0';
      overlay.classList.remove('hidden');
      overlayTitle.textContent = `${GamesModule.registry[GamesModule.currentId].icon} ${GamesModule.registry[GamesModule.currentId].name}`;
      overlaySub.textContent = 'Ready — press Start Game';
      toggleBtn.textContent = '▶ Start Game';
      metaEl.textContent = 'Ready';
    });

    document.getElementById('btnGameCamStart').addEventListener('click', toggleCamera);

    const extGrid = document.getElementById('extGameGrid');
    extGrid.innerHTML = EXTERNAL_GAMES.map(g => `
      <a class="ext-game-card" href="${g.url}" target="_blank" rel="noopener noreferrer">
        <div class="name"><span>${g.icon}</span>${g.name}</div>
        <div class="desc">${g.desc}</div>
        <div class="site">${g.site} ↗</div>
      </a>`).join('');
  }

  /* ---------------- mapping tab buttons ---------------- */
  function initMappingTab() {
    renderMappingTable();
    document.getElementById('btnResetMap').addEventListener('click', () => {
      if (!confirm('Reset gesture mapping to defaults?')) return;
      Settings.map = { ...DEFAULT_GESTURE_MAP };
      Settings.saveMap();
      renderMappingTable();
    });
    document.getElementById('btnSaveMap').addEventListener('click', () => {
      Settings.saveMap();
      const btn = document.getElementById('btnSaveMap');
      const orig = btn.textContent;
      btn.textContent = '✓ Saved';
      setTimeout(() => btn.textContent = orig, 1200);
    });
  }

  /* ---------------- camera tab buttons ---------------- */
  function initCameraTab() {
    document.getElementById('btnMirror').addEventListener('click', () => {
      const on = !Settings.get('mirror');
      Settings.set('mirror', on);
      CameraModule.toggleMirror(on);
      document.getElementById('settingMirror').checked = on;
      syncMirrorButtons();
    });
    document.getElementById('btnSkeleton').addEventListener('click', () => {
      CameraModule.showSkeleton = !CameraModule.showSkeleton;
      document.getElementById('btnSkeleton').textContent = `✋ Skeleton: ${CameraModule.showSkeleton ? 'On' : 'Off'}`;
      Settings.set('showSkeleton', CameraModule.showSkeleton);
      document.getElementById('settingShowSkeleton').checked = CameraModule.showSkeleton;
    });
    document.getElementById('btnToggleCamera').addEventListener('click', toggleCamera);
    document.getElementById('btnQuickStart').addEventListener('click', toggleCamera);
    syncMirrorButtons();
  }

  /* ---------------- boot ---------------- */
  window.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNav();
    renderGestureLegend();
    initCamera();
    initSettingsUI();
    initMappingTab();
    initGamingTab();
    initGamesTab();
    initMouseTab();
    initTrainerTab();
    initConnectTab();
    initCameraTab();
    populateCameraDevices();
    Broadcaster.init(Settings.get('channelName'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})();
