/* =========================================================
   background.js — GestureCTRL Bridge service worker
   Relays: [controller tab] --command--> background --> [target tab]
   The target tab is whichever tab the user explicitly picked
   from the popup ("Set this tab as gesture target").
   ========================================================= */
let state = {
  targetTabId: null,
  targetTabTitle: null,
  controllerTabId: null,
  enabled: true,
  lastCommand: null,
  commandCount: 0,
};

chrome.storage.local.get(['targetTabId', 'targetTabTitle', 'enabled'], (res) => {
  if (res.targetTabId) state.targetTabId = res.targetTabId;
  if (res.targetTabTitle) state.targetTabTitle = res.targetTabTitle;
  if (typeof res.enabled === 'boolean') state.enabled = res.enabled;
});

function persist() {
  chrome.storage.local.set({
    targetTabId: state.targetTabId,
    targetTabTitle: state.targetTabTitle,
    enabled: state.enabled,
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.targetTabId === tabId) { state.targetTabId = null; state.targetTabTitle = null; persist(); }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'register-controller': {
      state.controllerTabId = sender.tab?.id ?? null;
      sendResponse({ connected: !!state.targetTabId, activeTabTitle: state.targetTabTitle });
      return true;
    }
    case 'relay-command': {
      if (!state.enabled) { sendResponse({ ok: false, reason: 'disabled' }); return true; }
      state.lastCommand = msg.payload;
      state.commandCount++;
      if (state.targetTabId) {
        chrome.tabs.sendMessage(state.targetTabId, { type: 'execute', payload: msg.payload }).catch(() => {});
      }
      sendResponse({ ok: true, delivered: !!state.targetTabId });
      return true;
    }
    case 'set-target': {
      state.targetTabId = msg.tabId;
      state.targetTabTitle = msg.title || 'Target tab';
      persist();
      sendResponse({ ok: true });
      return true;
    }
    case 'clear-target': {
      state.targetTabId = null; state.targetTabTitle = null; persist();
      sendResponse({ ok: true });
      return true;
    }
    case 'get-state': {
      sendResponse({
        targetTabId: state.targetTabId,
        targetTabTitle: state.targetTabTitle,
        enabled: state.enabled,
        commandCount: state.commandCount,
        lastCommand: state.lastCommand,
      });
      return true;
    }
    case 'set-enabled': {
      state.enabled = msg.enabled;
      persist();
      sendResponse({ ok: true });
      return true;
    }
  }
});
