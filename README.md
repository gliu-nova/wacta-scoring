# WACTA Tennis Scores

Lightweight tennis group scoring app on **Cloudflare Pages + D1**.

- Public leaderboard & match history (no login)
- Optional password for submitting scores/players
- Mobile-friendly UI

## Stack

- **Frontend:** HTML + vanilla JS (`public/`)
- **API:** Hono on Cloudflare Pages Functions (`functions/`, `src/`)
- **Database:** Cloudflare D1 (SQLite)

## Local Development

```bash
npm install

# Create local D1 and run migrations
npx wrangler d1 create wacta-scoring   # first time only — copy database_id into wrangler.toml
npm run db:local

# Optional: require password to submit
cp .dev.vars.example .dev.vars

# Start dev server
npm run dev
```

Open http://localhost:8788

## Deploy to Cloudflare Pages (GitHub)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "WACTA Cloudflare app"
git remote add origin https://github.com/YOUR_USER/wacta-scoring.git
git push -u origin main
```

### 2. Create D1 database (production)

```bash
npx wrangler d1 create wacta-scoring
```

Copy the `database_id` into `wrangler.toml`, then:

```bash
npm run db:remote
```

### 3. Connect Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select your `wacta-scoring` repo
3. Build settings:
   - **Framework preset:** None
   - **Build command:** (leave empty)
   - **Build output directory:** `public`
4. Under **Settings → Functions**, ensure compatibility date matches `wrangler.toml`

### 4. Bind D1 + set secrets

In Pages project → **Settings** → **Bindings**:

| Type | Name | Value |
|------|------|-------|
| D1 database | `DB` | `wacta-scoring` |

Under **Settings** → **Environment variables** (optional):

| Name | Value |
|------|-------|
| `SUBMIT_PASSWORD` | your group password (encrypt as secret) |

### 5. Deploy

Every push to `main` auto-deploys. Or manually:

```bash
npm run deploy
```

Your site will be live at `https://wacta-scoring.pages.dev` (or your custom domain).

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/leaderboard` | No | Ranked players with W-L |
| GET | `/api/matches` | No | Recent matches |
| GET | `/api/players` | No | All players |
| POST | `/api/players` | Optional | Add player |
| POST | `/api/matches` | Optional | Submit match score |

Pass `password` in JSON body or `X-Submit-Password` header when `SUBMIT_PASSWORD` is set.