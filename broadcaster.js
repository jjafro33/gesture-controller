/* =========================================================
   broadcaster.js — cross-tab / cross-extension messaging
   Two independent transports:
     1. BroadcastChannel  -> same-origin tabs (e.g. receiver.html demo)
     2. window.postMessage -> relayed by the extension's content
        script (injected on this page) to the extension background,
        which forwards to the active target tab's content script.
   ========================================================= */
const Broadcaster = {
  channel: null,
  channelName: 'gesture-control-channel',
  listeners: [],
  extensionDetected: false,
  connectedSite: null,
  onLog: null,

  init(channelName) {
    this.channelName = channelName || Settings.get('channelName') || 'gesture-control-channel';
    if (this.channel) { try { this.channel.close(); } catch (e) {} }
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (ev) => this._handleIncoming(ev.data, 'broadcastchannel');
    }
    // listen for extension "handshake" / ack messages posted back into the page
    window.addEventListener('message', (ev) => {
      if (!ev.data || ev.data.source !== 'gesturectrl-extension') return;
      if (ev.data.type === 'handshake-ack') {
        this.extensionDetected = true;
        this.connectedSite = ev.data.activeTabTitle || 'Active tab';
        this._log(`Extension bridge connected → ${this.connectedSite}`);
        this._notify({ type: 'ext-status', connected: true });
      }
      if (ev.data.type === 'relay-ack') {
        this._log(`✓ Action delivered to page: ${ev.data.action}`);
      }
    });
    this._pingExtension();
  },

  _pingExtension() {
    window.postMessage({ source: 'gesturectrl-page', type: 'handshake' }, '*');
    setTimeout(() => {
      if (!this.extensionDetected) this._notify({ type: 'ext-status', connected: false });
    }, 900);
  },

  onMessage(fn) { this.listeners.push(fn); },

  _notify(payload) { this.listeners.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }); },

  _log(msg) { if (this.onLog) this.onLog(msg); },

  /** Send a structured gesture-action command to any listening tab / extension */
  send(command) {
    const payload = {
      source: 'gesturectrl',
      ts: Date.now(),
      ...command,
    };
    // 1. same-origin demo tabs
    if (this.channel) {
      try { this.channel.postMessage(payload); } catch (e) {}
    }
    // 2. extension bridge (content script listens on window for this page's postMessage)
    window.postMessage({ source: 'gesturectrl-page', type: 'command', payload }, '*');
    this._notify({ type: 'sent', payload });
    this._log(`→ ${payload.action || payload.gesture} (${payload.actionType || 'n/a'})`);
    return payload;
  },

  _handleIncoming(data, transport) {
    if (!data || data.source !== 'gesturectrl') return;
    this._notify({ type: 'received', payload: data, transport });
  },

  isChannelReady() { return !!this.channel; },
};
