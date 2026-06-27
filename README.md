# Contract Roulette

Browser-based Russian Roulette game with mock Solana wallet, single-player and multiplayer lobbies, and cinematic shot sequences.

## Run locally

1. Double-click `scripts/start-game.bat`, or run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
   ```
2. Open [http://localhost:8080](http://localhost:8080)

## Audio

- **Music** — tense action loop during active gameplay (toggle in top bar)
- **SFX** — hammer, cylinder spin, gunshot, empty click, win/lose stingers, cinema cues
- Preferences saved in browser localStorage

## Host on GitHub Pages

**Live URL (after enabling Pages):** [https://chicoded.github.io/russ/](https://chicoded.github.io/russ/)

Code is pushed to [github.com/chicoded/russ](https://github.com/chicoded/russ). Enable hosting once:

1. Open **[github.com/chicoded/russ/settings/pages](https://github.com/chicoded/russ/settings/pages)**
2. **Build and deployment → Source:** choose **Deploy from a branch**
3. **Branch:** `main` · **Folder:** `/ (root)`
4. Click **Save**
5. Wait 1–2 minutes, then open [https://chicoded.github.io/russ/](https://chicoded.github.io/russ/)

Alternatively, set Source to **GitHub Actions** — the repo includes a `Deploy to GitHub Pages` workflow that runs on every push to `main`.

> **Note:** Multiplayer lobby sync uses `localStorage` and `BroadcastChannel`, so it works across tabs on the same browser/device only.

## Project structure

| Path | Description |
|------|-------------|
| `index.html` | Main UI |
| `styles.css`, `cinema.css` | Styling & cinematics |
| `js/` | Game logic, wallet, lobby, contract mock |
| `scripts/` | Local dev server |
| `programs/` | Anchor smart contract (optional / mock mode default) |

## Practice mode

All SOL transactions are simulated locally. New users receive 100 practice SOL — no real funds.
