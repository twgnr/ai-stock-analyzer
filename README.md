# AI Stock Analyzer

A self-hosted, AI-assisted equity research and portfolio management app built with Next.js 16, React 19, MongoDB, and a multi-provider LLM backend (Claude, Gemini, OpenAI, Groq). It bundles everything a private investor typically juggles across a dozen tools — portfolio tracking, watchlists, alerts, fundamentals, charts, news, macro context, screeners, backtests, dividend planning, tax reports, and on-demand AI analyses — into a single PWA-installable web app.


---

## Features

### Portfolio & trades
- **Positions & transactions** — manual entry or CSV import from common brokers (Trade Republic, IBKR, Comdirect, ING, …). Buys/sells, splits, dividends, FX.
- **Performance metrics** — TWR, MWR (IRR), realized vs. unrealized P/L, daily/weekly/MTD/YTD attribution, FX-adjusted.
- **Risk analysis** — volatility, max drawdown, beta vs. benchmark, factor exposures, correlation matrix.
- **Portfolio health** — concentration warnings, sector/region/currency clusters, single-name caps.
- **Rebalance** — target weights with drift report and one-click trade suggestions.
- **Tax report** — realized gains export for the year (DE-style, structure adaptable).
- **Broker import** — CSV upload with broker auto-detection.

### Watchlist & alerts
- **Watchlist** with conviction scoring and personal notes per ticker.
- **Community watchlists** — share read-only lists by link, import to your own watchlist.
- **Price & indicator alerts** — threshold, % change, RSI, MA cross. Delivered via email and web push.
- **Alert history** with audit log.

### Market & macro
- **Market radar** — top gainers/losers across S&P 500, Nasdaq 100, DAX, MDAX, with optional auto-scan every 30 minutes during market hours.
- **Macro & sentiment** — VIX, yields, USD, gold, oil, gas, crypto, plus a custom sentiment composite.
- **US sector heatmap** — 11 SPDR sector ETFs at a glance.
- **Earnings & dividend calendars** with filters for portfolio/watchlist tickers.
- **Macro scenario analysis** — model "what if rates fall 100bps" / "USD weakens 10%" against your portfolio.

### Discovery & screening
- **Screener** with saved screens.
- **Breakout radar** — technical setups across major indices.
- **Discoveries** — IPOs and small-cap candidates curated from public filings.
- **Peer comparison** — fundamentals & multiples side-by-side.
- **Theme baskets** — themed equity universes (AI, defense, nuclear, …) with rolling performance and AI-generated thesis.

### AI analysis (per stock and per portfolio)
- **Bull/bear** synthesis from news, fundamentals and price action.
- **DCF** — assumption-driven valuation with sensitivity ranges.
- **Deep fundamentals** — multi-year ratio commentary.
- **Indicator analysis** — chart pattern reading with vision-capable models.
- **Earnings reaction** — what the print actually said vs. how the market reacted.
- **Insider activity** narrative.
- **Relationship map** — supply chain, customer/competitor graph.
- **Portfolio gaps & delta** — what's missing, what changed since last review.
- **Position sizing** suggestion.
- **News digest** — daily/weekly AI summary for tickers you follow.
- **Weekly briefing** — auto-generated portfolio newsletter.
- **Investment theses** — write, version, and track your own theses with AI critique.
- **Chat** — "ask the portfolio" RAG over your own positions, watchlist, theses and notes.
- **AI track record** — measures past AI recommendations against subsequent price action.
- **Backtest** — strategy backtests on historical data.

### Content & help
- **Strategies** library, **Glossary**, **Help & FAQ** — all linked to in-app context tooltips via a global help mode.
- **Magazines** — upload financial PDFs (up to ~32 MB) and have the AI extract a structured summary.

### Account, security, privacy
- Email + password registration with **mandatory email verification**.
- Optional **TOTP 2FA** (any authenticator app).
- **Password policy**: min. 10 chars, two character classes, common-password blacklist, no name/email substrings.
- **Per-user API keys** for Claude / Gemini / OpenAI / Groq / Finnhub, AES-256-GCM-encrypted at rest. Admins can optionally provide a shared key with per-user spend caps.
- **Rate limits** on login, registration, password reset, AI analyses, chat, and movers scans.
- **GDPR**: full data export (Art. 15/20) and account deletion (Art. 17) under `/settings`.
- **PWA**: installable on iOS/Android/Desktop, offline shell, push notifications.
- **Accessibility**: WCAG 2.2 AA target, dedicated accessibility statement page.

### Admin
- User management (approve, lock, force-reset password, delete).
- Test SMTP, monitor AI spend per user and operation.
- Global AI provider config + spend limits.
- Quote provider cascade (Yahoo → Finnhub → Stooq) with Yahoo daily quota cap.
- Movers auto-scan toggle.
- Login banner text (maintenance notices, etc.).
- Optional manual approval flow for new registrations.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) on React 19 |
| Styling | Tailwind CSS v4 + custom design tokens |
| Database | **MongoDB 6+** via Mongoose |
| Auth | JWT (HttpOnly, SameSite=Lax), bcrypt, otplib (TOTP) |
| Charts | lightweight-charts |
| Market data | yahoo-finance2, Finnhub (optional), Stooq fallback |
| AI providers | Anthropic Claude, Google Gemini, OpenAI, Groq — any combination |
| Mail | nodemailer over SMTP |
| Push | web-push (VAPID) |
| Cron | node-cron (in-process scheduling) |
| Tests | Vitest |

---

## Local development

### Requirements
- **Node.js 20+**
- **MongoDB 6+** running locally (or a connection string to a hosted instance)
- npm

### Setup

```bash
git clone https://github.com/twgnr/ai-stock-analyzer.git
cd ai-stock-analyzer
npm install
```

Create [.env.local](.env.local) (a working sample lives at the repo root for local dev):

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/ai-stock-analyzer
JWT_SECRET=<run: openssl rand -hex 32>
APP_SECRET_KEY=<run: openssl rand -hex 32>
APP_URL=http://localhost:3000
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account (the **first registered user is automatically promoted to admin**), and you're in.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Vitest in watch mode |

Maintenance helpers live in [scripts/](scripts/) — `list-users.mjs`, `make-admin.mjs`, `reset-users.mjs`.

---

## Deployment

A self-hosted production setup typically looks like this:

```
Internet → Caddy/Nginx (TLS) → Next.js on 127.0.0.1:3000 → MongoDB on 127.0.0.1:27017
```

The full step-by-step guide is in [DEPLOYMENT.md](DEPLOYMENT.md), covering:

1. Build the app and run it under **systemd** *or* **PM2** ([ecosystem.config.js](ecosystem.config.js) is included).
2. Production `.env.local` template with all required variables.
3. **TLS option A — Caddy** (recommended; automatic Let's Encrypt).
4. **TLS option B — Nginx + certbot**.
5. Hardening MongoDB (auth + bind to localhost).
6. Daily `mongodump` backup with rotation.
7. Post-deploy checklist (first admin, SMTP test, AI keys, movers auto-scan).
8. Security defaults you already get out of the box.
9. Monitoring (`journalctl`, AI usage, Yahoo quota).
10. Zero-downtime update flow.

### Required production environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | Session signing — production boot **fails** without it. Min. 32 random bytes |
| `APP_SECRET_KEY` | AES-256-GCM key for encrypting stored AI API keys. Rotating it invalidates every stored key |
| `APP_URL` | Public URL used in verification/reset/notification mails |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Outbound mail |
| `NODE_ENV=production` | Required |
| `PORT` *(optional)* | Defaults to `3000`. Must be set as a real process env var — Next.js binds the listener **before** reading `.env.local`. See [DEPLOYMENT.md](DEPLOYMENT.md#anderen-port-verwenden-zb-wenn-3000-belegt-ist) |

### What you get for free

- HttpOnly + Secure + SameSite cookies, 30-day session lifetime.
- bcrypt password hashing with a strict policy and common-password blacklist.
- Optional TOTP 2FA with brute-force-protected disable flow.
- API keys never returned to the browser (only last-4 preview).
- Rate limits on auth, AI, and scan endpoints.
- CSP, HSTS, X-Frame-Options, Referrer-Policy, COOP, Permissions-Policy headers.
- SSRF protection on user-configurable LLM base URLs.
- Neutral responses on register/forgot-password to prevent account enumeration.
- GDPR data export + account deletion that cascades across all user-owned models.
- Public legal pages (`/impressum`, `/datenschutz`, `/barrierefreiheit`, `/hilfe`).

### What you still need to handle yourself

- **Off-site backups** of `APP_SECRET_KEY` plus the Mongo dump (without the key, the encrypted API keys in a backup are unrecoverable).
- **Multi-instance scaling** — the in-memory rate limiter is per-process; clustering needs a Redis-backed limiter.
- **Market-data licensing** — Yahoo Finance terms do not permit commercial use. For commercial deployments, switch the provider cascade to a licensed source (Twelve Data, Polygon, EOD Historical, Refinitiv).
- **Regulatory classification** of AI-generated buy/hold/sell suggestions in your jurisdiction.

---

## Project layout

```
app/          App Router routes (pages + API)
  api/        Server endpoints — auth, analyze/*, portfolio, stocks, admin, …
components/   React components
lib/          Domain logic, data providers, AI clients, auth, formatting
public/       Static assets and PWA manifest
scripts/      Maintenance scripts (Node)
tests/        Vitest test suite
proxy.ts      Edge security headers
instrumentation.ts  Next.js boot hooks (cron registration etc.)
```

---

## License

MIT — see [LICENSE](LICENSE).
