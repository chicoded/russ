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

### Multiplayer lobbies (required for cross-device join)

1. In your Vercel project → **Storage** → **Create Database** → **Upstash Redis** → connect to the project
2. Redeploy — this sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` automatically
3. Host clicks **Copy link** and shares the full URL with friends (not just the 6-character key)

Without Redis, lobbies only work in the same browser. The join link still works once across devices by embedding lobby data in the URL.

> **Note:** All players must use the **same site URL** (e.g. your Vercel link, not `localhost`).

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
