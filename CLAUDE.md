# morse_trainer

ICR Trainer: a browser drill for instant character recognition in Morse code. Static PWA with no build step. Start with [README.md](README.md).

Deployed at <https://jtroyer76.github.io/morse_trainer/> by GitHub Pages from `main` (repo root). A push to `main` is a release.

## Rules

- **No AI attribution** in commits or PRs: no Co-Authored-By lines, no "Generated with" footers.
- **Conventional Commits**: `type: summary`, lower-case type, e.g. `feat: …`, `fix: …`, `docs: …`. Types: `feat`, `fix`, `docs`, `test`, `ci`, `build`, `refactor`, `perf`, `chore`.
- **Bump `CACHE` in `sw.js`** whenever a file the service worker caches changes, or installed clients keep the old version.
- **Never guess** facts or API behaviour; check the source or say it's unknown.
- **Search the whole repo** for related references when changing something (README, Help tab, `sw.js` file list).
- **Knowledge goes in the repo,** not the assistant's local memory: the owner works on several machines.
- **Standalone product.** Don't reference the owner's other repos or projects.

## Working notes

- Run locally: `python -m http.server 8000`, then open `http://localhost:8000`.
- Files: `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`, `icons/`.
