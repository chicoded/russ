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

## Host on Vercel

Repo: [github.com/chicoded/russ](https://github.com/chicoded/russ)

1. Sign in at **[vercel.com](https://vercel.com)** (GitHub login works)
2. **Add New → Project** → import **chicoded/russ**
3. Leave defaults — **Framework Preset: Other**, no build command, output is the repo root
4. Click **Deploy**

Every push to `main` redeploys automatically. Your live URL will look like `https://russ-*.vercel.app` (you can add a custom domain in project settings).

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
