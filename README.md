# ICR Trainer

Browser drill for instant character recognition (ICR) in Morse code.

- Koch order, one character at a time. Add the next when the current set is solid.
- Character speed 25 WPM by default. No Farnsworth; ICR does not form at slow speeds.
- Reaction time is measured from the **end of the last element** to your tap or keypress.
- Each character keeps its last 20 trials in `localStorage`. The Stats tab shows median
  reaction time versus the fastest character (the floor). A character sitting well above
  the floor is not in ICR yet.
- Weak and slow characters come up more often.
- The app suggests adding the next character when every active character has at least
  10 trials, 90% accuracy, and a median within 150 ms of the floor.

## Run

Any static server works. From this folder:

    python -m http.server 8000

Open `http://localhost:8000` on the PC, or `http://<pc-ip>:8000` on a phone on the same network.
Opening `index.html` directly from disk also works in most browsers.

Keys on desktop: Space starts, Esc stops, Enter replays, letters and digits answer.

## PWA

The app installs as a progressive web app and works offline once loaded over HTTPS.
`sw.js` caches the files; bump its `CACHE` name when shipping changes so installed
clients pick them up.
