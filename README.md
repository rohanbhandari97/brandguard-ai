# BrandGuard AI

A brand-content workspace: the existing HTML/CSS/JavaScript UI plus a Node.js Express API that reviews copy with Groq's free-tier, OpenAI-compatible API (`https://api.groq.com/openai/v1`).

This product does **not** include user accounts, a database, image analysis, or source-backed fact verification. Claims in submitted copy are flagged as **unverified** unless they are not factual claims at all.

## Run it locally

1. Install [Node.js 18+](https://nodejs.org/).
2. In this folder, install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template and add your secret key **only** in `.env` (never in frontend files):

   ```bash
   copy .env.example .env
   ```

   On macOS/Linux use `cp .env.example .env`.

4. Edit `.env`:

   ```
   PORT=3000
   GROQ_API_KEY=gsk_your-real-key
   FRONTEND_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
   ```

   Create a free-tier key at [Groq Console](https://console.groq.com/keys). The **environment variable must be** `GROQ_API_KEY`. Do not set OpenAI keys or paid Groq billing. The default model is `openai/gpt-oss-20b` from [Groq's official model list](https://console.groq.com/docs/models).

5. Start the server:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000). Use **Check content** and **Suggest safer rewrite** from the existing workspace.

7. Optional health check: [http://localhost:3000/api/health](http://localhost:3000/api/health)

If you open `index.html` as a file instead of through the server, the UI still works, but review calls expect the API at `http://localhost:3000`. Prefer `npm start`.

## Project structure

- `index.html`, `css/style.css`, `js/app.js` — existing UI (layout preserved)
- `server.js` — process entry
- `src/app.js` — Express app, CORS, rate limits, static files
- `src/routes/` — `/api/health`, `/api/reviews`, `/api/corrections`
- `src/controllers/` — HTTP handlers
- `src/services/` — Groq review and rewrite logic
- `src/middleware/` — validation and errors
- `.env.example` — placeholder values only
- `tests/` — API and mapping tests

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness; reports whether Groq is configured (never returns the key) |
| POST | `/api/reviews` | Review submitted text against brand guidelines |
| POST | `/api/corrections` | Suggest a meaning-preserving rewrite |

### Review body

```json
{
  "content": "Your draft copy",
  "brandGuidelines": "Optional guidelines text",
  "campaignName": "Optional campaign name",
  "channel": "Optional channel"
}
```

Findings include category, severity, flagged excerpt, explanation, guideline evidence when it comes from the supplied rules, a suggested correction, and `claimVerification.status` of `unverified` or `not_a_claim`. The API never marks a fact as verified.

### Correction body

Same fields as review, plus optional `flaggedText` to focus the rewrite.

## Tests

```bash
npm test
```

These tests mock the Groq provider and do not consume API quota. They cover health, validation, mapping, mocked reviews, and the unconfigured-key path.

## Deploy on Render

1. Push this project to a Git host (only when you choose to). Confirm `.env` is not committed.
2. In Render, create a **Web Service** from the repo (or use `render.yaml`).
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/api/health`
4. Environment variables in the Render dashboard (not in Git):
   - `GROQ_API_KEY` — your Groq free-tier secret key
   - `FRONTEND_ORIGIN` — your live site origin(s), comma-separated, e.g. `https://your-service.onrender.com`
   - `NODE_ENV` — `production`
5. After deploy, open the Render URL. The same service serves the UI and the API.

Do not paste the API key into `js/app.js`, Render logs discussions, or GitHub.

## Current limitations

- No authentication, database, or persistent approval history (history still lives in the browser session).
- No image upload or image analysis. Visual notes only apply when the **text** describes a visual treatment.
- No source-backed fact checking. Unsupported claims are labeled unverified.
- Dashboard and Insights figures remain illustrative sample data.
- Color contrast checking remains a local WCAG helper in the browser.
