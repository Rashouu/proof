# Proof

An offline to-do app for iPhone. Every task you finish adds a tally mark to a year-long record.

- Runs entirely on your phone. Tasks are stored in the app's own storage and never sent anywhere.
- No third-party code, no build step, no analytics. A Content Security Policy blocks every network request from the app.
- Fonts (Anybody, Atkinson Hyperlegible Next) are bundled under the SIL Open Font License; see `fonts/`.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure and the security policy |
| `styles.css` | All styling |
| `app.js` | Screens and interactions |
| `logic.js` | Dates, sorting, streaks, search, tallies, backup checks (no browser APIs) |
| `db.js` | Saving tasks on the phone (IndexedDB) |
| `sw.js` | Offline support: caches every app file |
| `tests/logic.test.js` | Unit tests for `logic.js` |

## Test and run locally

```
node --test
python -m http.server 8080 --bind 127.0.0.1
```

Then open http://localhost:8080.

## Publish on GitHub Pages (first time)

1. Turn on two-factor authentication for your GitHub account. Whoever controls this account controls the code your phone loads.
2. Create a new **public** repository, for example `proof`, with no README.
3. Push this folder to it.
4. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then save.
5. After a minute the app is live at `https://<your-username>.github.io/proof/`.

## Install on iPhone

1. Open the address above in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open Proof from the Home Screen and use it from there. The installed app keeps its own storage, separate from Safari tabs.
4. Back up from time to time: **Year → ⋯ → Export backup**. Deleting the app from your Home Screen deletes its data.

## Release an update

1. Change `VERSION` in `sw.js` (for example `proof-v2`). Without this, phones keep the old files.
2. Push to GitHub.
3. On the phone, open Proof while online. It downloads the update in the background and uses it the next time you open the app.
