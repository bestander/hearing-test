# Kids Hearing Test (prototype)

This is a small browser prototype of a hearing screening app for children. It's a demo only — not for clinical use. Replace placeholder assets with real, calibrated recordings and perform proper SPL calibration before any real testing.

Quick start
1. Install (optional): ensure you have Node.js + npm available.
2. Start a local static server and open the app:

```bash
npm install   # optional
npm start
# then open http://localhost:8000 in your browser
```

What changed in this workspace
- meSpeak was removed from the runtime and the app no longer depends on an embedded eSpeak shim.
- Natural-sounding WAV files for each dictionary word were generated locally (macOS `say` + `afconvert`) and saved to `assets/audio/*.wav`. The app preloads these files and plays them via WebAudio so left/right panning and level control work reliably.

Project layout
- `index.html` — UI
- `css/style.css` — styles
- `js/app.js` — test logic, audio preloading and WebAudio playback
- `assets/img/` — demo images (SVGs)
- `assets/audio/` — per-word WAV files (generated locally)

Testing notes
- Serve the site over `http://` (see `npm start`) — opening `index.html` via `file://` will trigger CORS and audio fetch failures and the app will fall back to synthetic beeps.
- Open DevTools → Network to confirm `assets/audio/*.wav` requests return 200 and are decoded by the browser.

Next steps you might want me to do
- Remove leftover `assets/mespeak/` files (I can delete them now that meSpeak is abandoned).
- Add a small automated smoke test (Puppeteer) to verify audio preloads and one trial flow.
- Regenerate WAVs with a different voice/sample rate or replace them with real recorded words.

If you want any of the above, tell me which and I'll proceed.
