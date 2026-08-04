/* =========================================================
   content.js — runs on EVERY page. Plays two roles:
   A) On the GestureCTRL controller tab: relays window.postMessage
      commands from the page into the extension background.
   B) On the target tab (game/video/slides/etc.): receives
      commands from background and dispatches real DOM events.
   ========================================================= */

/* ---------- A) controller-tab bridge ---------- */
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const data = ev.data;
  if (!data || data.source !== 'gesturectrl-page') return;

  if (data.type === 'handshake') {
    chrome.runtime.sendMessage({ type: 'register-controller' }, (res) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({
        source: 'gesturectrl-extension',
        type: 'handshake-ack',
        activeTabTitle: res?.activeTabTitle || null,
      }, '*');
    });
  }

  if (data.type === 'command') {
    chrome.runtime.sendMessage({ type: 'relay-command', payload: data.payload }, (res) => {
      if (chrome.runtime.lastError) return;
      window.postMessage({ source: 'gesturectrl-extension', type: 'relay-ack', action: data.payload.action, delivered: res?.delivered }, '*');
    });
  }
});

/* ---------- B) target-tab executor ---------- */
let virtualCursorEl = null;
function ensureCursor() {
  if (virtualCursorEl && document.body.contains(virtualCursorEl)) return virtualCursorEl;
  virtualCursorEl = document.createElement('div');
  virtualCursorEl.id = '__gesturectrl_cursor__';
  Object.assign(virtualCursorEl.style, {
    position: 'fixed', width: '18px', height: '18px', borderRadius: '50%',
    border: '2px solid #00f0ff', background: 'rgba(0,240,255,0.25)',
    zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-50%,-50%)',
    boxShadow: '0 0 12px #00f0ff', transition: 'left 60ms linear, top 60ms linear',
    left: '50%', top: '50%',
  });
  document.documentElement.appendChild(virtualCursorEl);
  return virtualCursorEl;
}

const CODE_TO_KEY = {
  Space: ' ', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  Escape: 'Escape', ShiftLeft: 'Shift', Equal: '=', Minus: '-',
};
function codeToKey(code) {
  if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function dispatchKey(code) {
  const key = codeToKey(code);
  const opts = { key, code, bubbles: true, cancelable: true, composed: true };
  document.dispatchEvent(new KeyboardEvent('keydown', opts));
  window.dispatchEvent(new KeyboardEvent('keydown', opts));
  const active = document.activeElement;
  if (active && active !== document.body) active.dispatchEvent(new KeyboardEvent('keydown', opts));
  setTimeout(() => {
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
    window.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (active && active !== document.body) active.dispatchEvent(new KeyboardEvent('keyup', opts));
  }, 55);
}

function dispatchMouse(action) {
  const cursor = ensureCursor();
  const rect = cursor.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const target = document.elementFromPoint(x, y) || document.body;
  const common = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
  if (action === 'move') return;
  if (action === 'click') {
    target.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...common, button: 0 }));
  } else if (action === 'rightclick') {
    target.dispatchEvent(new MouseEvent('contextmenu', { ...common, button: 2 }));
  } else if (action === 'dblclick') {
    target.dispatchEvent(new MouseEvent('dblclick', { ...common, button: 0 }));
  }
}

function moveCursor(point) {
  const cursor = ensureCursor();
  cursor.style.left = (point.x * window.innerWidth) + 'px';
  cursor.style.top = (point.y * window.innerHeight) + 'px';
}

function dispatchWheel(deltaY) {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

function dispatchSystem(action) {
  if (action === 'fullscreen') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'execute') return;
  const cmd = msg.payload;
  try {
    if (cmd.actionType === 'key') {
      if (cmd.gesture === 'swipe_up') dispatchWheel(-200);
      else if (cmd.gesture === 'swipe_down') dispatchWheel(200);
      dispatchKey(cmd.action);
    } else if (cmd.actionType === 'mouse') {
      if (cmd.action === 'move' && cmd.point) moveCursor(cmd.point);
      else dispatchMouse(cmd.action);
    } else if (cmd.actionType === 'system') {
      dispatchSystem(cmd.action);
    }
  } catch (e) { /* page may block synthetic events on some sites (e.g. strict CSP games) */ }
});
