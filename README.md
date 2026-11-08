# PortfolioProof — Evidence-Backed Skill Portfolio

PortfolioProof is a full-stack portfolio workspace for presenting skills alongside evidence and projects. It uses React and Vite for the UI, Express for the REST API, and MongoDB Atlas with Mongoose for persistent storage. The production Express server also serves the built frontend as a single Render web service.

## Features

- Dashboard with live skill, project, evidence, and activity metrics.
- Create, edit, search, filter, and delete skills and projects.
- Categorized skills with proficiency levels and evidence links.
- Projects with technology tags, related skills, GitHub/live links, and additional evidence.
- Public-facing portfolio view.
- Portfolio-owner registration and login with password hashing, HttpOnly sessions, and authenticated write operations.
- Responsive Gemini-powered AI chat. The API key remains on the backend.
- URL and request validation, centralized API errors, MongoDB health reporting, CORS, security headers, and rate limiting.
- Optional sample records through an explicit seed command; existing portfolio data is never overwritten or deleted.

## Requirements

- Node.js 20 or later
- npm 10 or later
- A MongoDB database (MongoDB Atlas is recommended)

## Run locally

1. Copy `.env.example` to `.env` in the project root.
2. Set `MONGODB_URI` to your MongoDB connection string. In Atlas, allow your development IP address and create a database user with access to the target database.
3. Install dependencies and start both development servers:

   ```powershell
   npm install
   npm run dev
   ```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The Vite development server proxies `/api` requests to Express at `http://localhost:5000`.

The backend exits with an explicit error if MongoDB cannot be reached; it never substitutes mock responses for database data.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string. Keep credentials only in `.env` or your hosting provider’s secret settings. |
| `PORT` | No | Express port; defaults to `5000`. Render provides this automatically. |
| `NODE_ENV` | No | Use `production` when deployed. |
| `CLIENT_ORIGIN` | No | Comma-separated allowed browser origins. Local development always allows `http://localhost:5173` and `http://127.0.0.1:5173`; production cross-origin access is restricted to this explicit list. The production single-service setup is same-origin. |
| `VITE_API_BASE_URL` | No | Frontend API base URL; defaults to `/api` for both Vite proxy and same-origin production. |
| `SESSION_SECRET` | Yes for authentication | Use a unique random secret of at least 32 characters. Keep it private; set it in the root `.env` locally and in the Render environment. |
| `AUTH_BASE_URL` | Required for production OAuth and password-reset links | Public application origin used to construct provider callbacks and reset links, for example `https://your-service.onrender.com`. In local development, the Vite `/api` proxy origin is used. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth credentials. Register the callback URI `{AUTH_BASE_URL}/api/auth/google/callback` in Google Cloud Console. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth App credentials. Set its callback URL to `{AUTH_BASE_URL}/api/auth/github/callback`. The app requests `read:user` and `user:email` and requires a verified primary email. |
| `RESEND_API_KEY` | Required for password recovery | Backend-only Resend API key used to send one-time password-reset links. |
| `PASSWORD_RESET_FROM` | Required for password recovery | Verified Resend sender address, for example `PortfolioProof <no-reply@your-domain.example>`. |
| `PASSWORD_RESET_URL` | Optional | Public application origin for reset links. Defaults to `AUTH_BASE_URL` in production and localhost Vite in development. |
| `GEMINI_API_KEY` | No | Google Gemini API key for AI chat. Configure only in the backend/root `.env` or hosting environment, never in a `VITE_` variable. Chat reports a configuration error when it is absent. |
| `GEMINI_MODEL` | No | Gemini model identifier; defaults to `gemini-3.6-flash`. |

Anyone can open the application and create an account. Each account has an isolated private workspace; log in with the account email or username. The account's public portfolio is available at `/portfolio/{username}`, while `/portfolio` continues to show the original portfolio-owner account. Existing records without an owner are assigned at startup to the original account whose `workspaceKey` is `portfolio-owner`; the migration only sets ownership fields and replaces the global skill-name unique index with a per-owner index. It does not remove or rewrite existing portfolio content.

**Forgot password?** sends a one-time link that expires after 30 minutes and can be used once; configure the Resend variables above to enable delivery. Google asks you to choose an account, and the backend OAuth endpoints remain available when configured; provider accounts are matched and linked only after the provider verifies the email. Google/GitHub sign-in buttons are intentionally not shown on the login page. Account creation, login, and private workspace reads/edits require MongoDB to be available. Portfolio reads remain public. The session cookie is HTTP-only and logout revokes the active session. SMS/mobile OTP is not enabled.

The **Ask AI** assistant requires an authenticated owner session and a configured `GEMINI_API_KEY`. It uses the real Gemini API and the current portfolio context; it does not return canned responses. Conversation history remains in the current browser session.

Sample data is **not** inserted automatically at application startup. To seed a completely empty database intentionally, run `npm run seed`; the seed command skips if either portfolio collection already has records. Seeded entries can then be edited or deleted from the application like other records, and startup will not recreate them.

To add the supplied SmartSpend AI project once MongoDB is reachable, run `npm run add:smartspend`. The command checks for the exact project title first and links only existing skills whose names match technologies used by the project; it does not create, overwrite, or delete skills or other projects.

### Local production preview

```powershell
npm run build
npm start
```

The Express service serves `frontend/dist` and exposes the API under `/api`. Visit `http://localhost:5000`.

### API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service and MongoDB connection status |
| `GET` | `/api/skills` | List skills; accepts `search` and `category` query parameters |
| `POST` | `/api/skills` | Create a skill |
| `PUT` | `/api/skills/:id` | Update a skill |
| `DELETE` | `/api/skills/:id` | Delete a skill and unlink it from projects |
| `GET` | `/api/projects` | List projects; accepts a `technology` query parameter |
| `POST` | `/api/projects` | Create a project |
| `PUT` | `/api/projects/:id` | Update a project |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/dashboard/stats` | Live portfolio summary and recent activity |
| `POST` | `/api/auth/register` | Register the single portfolio owner |
| `POST` | `/api/auth/login` | Start an owner session |
| `POST` | `/api/auth/logout` | Revoke the owner session and clear its cookie |
| `GET` | `/api/auth/me` | Get the current owner session |
| `POST` | `/api/assistant/chat` | Send conversation history to Gemini (owner session required) |

## Deploy to Render

1. Create your own GitHub repository and push this project when you are ready. The GitHub links in the UI point to the requested project URL but do not imply that code has already been pushed.
2. In Render, create a **Blueprint** from your repository and use the included `render.yaml`, or create a Node web service with the commands below.
3. Set `MONGODB_URI` in Render’s environment settings to your Atlas connection string. Configure the Atlas network access list to allow your Render service to connect. Never add the URI to source control.
4. Deploy. Render runs `npm install && npm run build`, then `npm start`; Express serves the Vite build from the same web service. `/api/health` is the configured health check.
5. Demo records are never inserted on startup. If you intentionally want sample entries, use `npm run seed`; it leaves any non-empty portfolio collections untouched.

## Verification commands

```powershell
npm install
npm run build
npm test
npm run check -w backend
```

API health and CRUD endpoints require a reachable MongoDB instance configured through `MONGODB_URI`.