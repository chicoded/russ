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

This repo is a static site — no build step required.

1. Push this repo to GitHub ([chicoded/russ](https://github.com/chicoded/russ)).
2. On GitHub: **Settings → Pages**
3. **Source:** Deploy from branch
4. **Branch:** `main` / **Folder:** `/ (root)`
5. Save — your site will be at `https://chicoded.github.io/russ/`

> **Note:** Multiplayer lobby sync uses `localStorage` and `BroadcastChannel`, so it works across tabs on the same browser/device only. GitHub Pages hosting does not change that.

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
