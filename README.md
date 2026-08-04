# GestureCTRL — AI Gesture-Controlled Website

Control another browser tab (a Poki game, YouTube, Google Slides, Canva, Google Maps, any HTML5 game...)
using nothing but hand gestures read from your webcam.

Built with: HTML5 · CSS3 · vanilla ES6 · **MediaPipe Hands** · Canvas API · WebRTC ·
**BroadcastChannel API** · `postMessage` · a companion **Chrome/Edge extension** (MV3) · PWA.

Includes a **Games** tab with five built-in gesture-controlled games (split-screen: game on one
side, live camera + gesture readout on the other) plus links out to more gesture-controlled games
built by other developers.

---

## 1. Run it

No build step — it's a static site.

```bash
cd gesture-controller
python3 -m http.server 8080
# open http://localhost:8080
```

Or deploy the whole folder as-is to **Vercel** / Netlify / GitHub Pages (drag-and-drop deploy works,
same as your other Nublix projects). MediaPipe's model files load from a CDN, so it needs internet access
but no server-side code at all.

> Camera access requires **HTTPS or localhost** — that's a browser rule, not this app's.

## 2. What's inside

```
gesture-controller/
├── index.html        # app shell: dashboard, camera, mapping, gaming, mouse, trainer, connect, settings
├── style.css          # neon-glass design system (CSS variables, dark/light themes)
├── script.js           # boots everything, wires UI <-> modules, particle bg, nav
├── camera.js            # webcam lifecycle + MediaPipe Hands pipeline + skeleton drawing
├── gestures.js            # GestureEngine: landmark geometry -> 22 gesture classes
├── controls.js             # gesture -> mapped action -> local dispatch + broadcast
├── broadcaster.js           # BroadcastChannel + postMessage bridge to the extension
├── trainer.js                # record / save / export / import custom gestures
├── games.js                   # built-in gesture-controlled mini games (Games tab)
├── settings.js                 # default gesture map, gaming preset, persisted settings
├── receiver.html               # demo "Tab 2" — proves cross-tab control with zero setup
├── manifest.json / sw.js        # PWA install + offline shell caching
├── icons/                        # generated app icons (16 → 512px)
└── extension/                     # the browser extension ("Browser Extension Mode")
    ├── manifest.json                # MV3
    ├── background.js                 # relays commands to whichever tab you pick as target
    ├── content.js                     # (a) bridges this web app's page, (b) executes real
    │                                     keyboard / mouse / wheel / fullscreen events on the target tab
    ├── popup.html / popup.js           # pick "this tab" as the gesture target
    └── icons/
```

## 3. Recognized gestures (22)

Open Palm · Closed Fist · Pointing Finger · Thumbs Up · Thumbs Down · Peace Sign · OK Sign · Rock Sign ·
Swipe Left/Right/Up/Down · Pinch · Double Pinch · Zoom In/Out (two hands) · Rotate CW/CCW (two hands) ·
Hold Gesture · Three/Four/Five Fingers — plus unlimited **custom gestures** from the Trainer tab.

Every gesture is computed purely from MediaPipe's 21 landmarks per hand (no extra ML model needed);
custom gestures use a lightweight nearest-neighbour match against a recorded template, so the whole
app runs client-side with zero backend.

## 4. Two ways to control another tab

**A. Same-site demo (works instantly, no install)**
Open `receiver.html` in a second tab (button on the *Connect Tabs* page does this for you). Both tabs
share a `BroadcastChannel`, so gestures performed in the controller immediately animate the receiver
— play/pause, seek, volume, zoom, rotate, click.

**B. Any real website, via the extension**
`BroadcastChannel` only works across tabs of the *same origin*, so to reach Poki, YouTube, Slides, etc.
you need the bundled extension:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/`.
2. Open your target tab (e.g. a Poki game), click the extension icon, **"Set this tab as gesture target"**.
3. Go back to the GestureCTRL tab and start gesturing — the extension turns each mapped gesture into a
   real `KeyboardEvent` / `MouseEvent` / `WheelEvent` / fullscreen call on that tab.

Architecture:

```
GestureCTRL tab                 extension                      Target tab (Poki/YouTube/...)
──────────────────              ───────────────────             ──────────────────────────
camera + MediaPipe
  → GestureEngine
    → Controls (mapping)
      → window.postMessage  →  content.js (bridge)
                                  → background.js (router)
                                       → chrome.tabs.sendMessage → content.js (executor)
                                                                      → dispatch key/mouse/wheel events
```

## 5. Games tab

A dedicated **Games** view with a split-screen layout: your chosen game runs on the left, and a
live camera + gesture readout panel stays visible on the right the whole time, so you can always
see what the tracker sees while you play. Five built-in games, all client-side canvas games driven
directly by `gestures.js` — no extension or second tab required:

| Game | Controls |
|---|---|
| ✏️ **Gesture Draw** | ☝️ Point = draw · 🖐️ Palm = pen up · ✊ Fist = clear · ✌️ Peace = change color · 👌 OK = export PNG |
| 🍉 **Fruit Slice** | Your fingertip is the blade — swipe through fruit to slice it, avoid the bombs, 3 misses ends the round |
| 🐹 **Whack-a-Mole** | Aim your fingertip at a hole, 🤏 pinch to whack — gold moles are bonus points, bombs cost points, 45s round |
| 🐦 **Gesture Bird** | 🖐️ Open palm = flap upward through the pipes (Flappy-Bird style) |
| ✊ **Rock · Paper · Scissors** | Throw ✊/🖐️/✌️ right when the countdown hits "Shoot!" against a CPU opponent |

Below the built-in games, a **"More gesture-controlled games from around the web"** section links
out to games built by other developers (e.g. Fruit Slasher, Pug's Hunt, Motion Arcade, Motions,
itch.io's webcam tag). Those run on their own origins, so this app can't embed or split-screen
them directly — open them in a new tab and they'll ask for camera access themselves, or, for
keyboard-driven games, use **Connect Tabs** and the browser extension to target that tab with your
own gesture map.

## 6. Gaming Mode

The *Gaming Mode* tab applies a preset tuned for HTML5 games in one click: Open Palm = Pause,
Swipe Left/Right = Move, Fist = Attack, Peace = Jump, Thumbs Up = Sprint, Pinch = Shoot, Hold = Charge.
Edit any binding afterwards from *Gesture Map*.

## 7. Gesture Trainer

Type a name (and optional key binding) → hold your pose for 2 seconds → it's saved to `localStorage`
and immediately recognized alongside the built-in gestures. Export/import as JSON to move a trained
gesture set between browsers or share it with teammates.

## 8. Settings that matter for accuracy

- **Sensitivity** — lowers/raises how far a swipe must travel before it fires.
- **Gesture hold time** — how long a static pose must be held before `hold_gesture` fires.
- **Pinch threshold** — thumb–index distance (relative to palm width) that counts as a pinch.
- **FPS limit** — caps MediaPipe inference rate to save CPU on lower-end machines.

All settings, the gesture map, and custom gestures persist in `localStorage` per browser.

## 9. Notes / limitations

- Gesture accuracy depends on lighting and camera angle, like any webcam hand-tracking system.
- The extension executes synthetic DOM events; a small number of sites with very strict input handling
  (e.g. some canvas/WebGL games that read raw OS input) may not respond to synthetic events — this is a
  general browser-security limitation, not specific to this app.
- `BroadcastChannel` is same-origin by design — that's exactly why the extension exists for cross-site control.
