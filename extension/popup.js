function refresh() {
  chrome.runtime.sendMessage({ type: 'get-state' }, (state) => {
    if (!state) return;
    document.getElementById('cmdCount').textContent = state.commandCount || 0;
    document.getElementById('targetLabel').textContent = state.targetTabTitle || 'None selected';
    document.getElementById('toggleEnabled').checked = state.enabled !== false;
    document.getElementById('bridgeEnabled').textContent = state.enabled !== false ? 'Enabled' : 'Disabled';
    document.getElementById('dotBridge').className = 'dot ' + (state.targetTabId ? 'on' : 'off');
  });
}

document.getElementById('btnSetTarget').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    chrome.runtime.sendMessage({ type: 'set-target', tabId: tab.id, title: tab.title }, refresh);
  });
});

document.getElementById('btnClearTarget').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clear-target' }, refresh);
});

document.getElementById('toggleEnabled').addEventListener('change', (e) => {
  chrome.runtime.sendMessage({ type: 'set-enabled', enabled: e.target.checked }, refresh);
});

refresh();
