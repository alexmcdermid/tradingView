# Development Guide - TradingView Frontend

## Setup

Install dependencies:
```bash
npm install
```

## Local Development

Run the dev server:
```bash
npm run dev
```

This starts the Vite dev server at `http://localhost:5173` with hot module replacement.

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm test -- --watch
```

Type-check:
```bash
npm run typecheck
```

## Building

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Environment Variables

Create a `.env.local` file for local development:

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_USE_HEADER_AUTH=true
VITE_USER_ID=local-user
VITE_ADMIN_EMAILS=admin@example.com
VITE_APP_ENV=local
VITE_PUBLIC_ORIGIN=http://localhost:5173
VITE_PUBLIC_HOST_ALLOWLIST=localhost:5173,127.0.0.1:5173
```

### Variable Descriptions

**Required:**
- `VITE_API_BASE_URL` — Backend API base URL (e.g. `https://dev-api.tradelog.ca/api/v1`)
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID for authentication
- `VITE_PUBLIC_ORIGIN` — Canonical frontend origin used for SSR metadata and public share image URLs

**Optional:**
- `VITE_PUBLIC_HOST_ALLOWLIST` — Comma-separated hosts accepted by SSR requests, in addition to `VITE_PUBLIC_ORIGIN`
- `VITE_ADMIN_EMAILS` — Comma-separated list of admin email addresses
- `VITE_USE_HEADER_AUTH` — Enable header-based auth for development (set to `false` in production)
- `VITE_USER_ID` — Default user ID for header-based auth (dev only)
- `VITE_APP_ENV` — Environment label shown in share links (e.g. "dev", "prod")

## Authentication

The frontend sends the Google credential once to `POST /api/v1/auth/login`. The backend validates it, creates a first-party `HttpOnly` session cookie, and subsequent API calls use `credentials: "include"` instead of a bearer token in browser storage.

If dev login is rejected because the Google account is outside the backend dev allowlist, the frontend remains in guest mode and shows a contact-the-repo-owner message instead of silently failing. Prod leaves the backend allowlist empty, so any valid Google account can sign in to isolated per-user data.

Unsafe API methods first fetch `GET /api/v1/auth/csrf` and send the returned CSRF header. The API client caches the returned token and shares one in-flight CSRF request across concurrent unsafe calls. Logout clears the cached token.

Local header auth is still available only when `VITE_USE_HEADER_AUTH=true`; production builds should leave it disabled.

Keep browser session auth same-site. The intended topology is `https://dev.tradelog.ca` or `https://www.tradelog.ca` calling an API on another `*.tradelog.ca` hostname. If the API moves to a different registrable domain, the backend must use `APP_SESSION_COOKIE_SAME_SITE=none` with `APP_SESSION_COOKIE_SECURE=true`.

## SSR Security

SSR requests are rejected unless the request host matches `VITE_PUBLIC_ORIGIN` or `VITE_PUBLIC_HOST_ALLOWLIST`. OpenGraph and Twitter image URLs are built from `VITE_PUBLIC_ORIGIN`, not from `Host` or `X-Forwarded-*` headers.

The root route emits a CSP plus `Referrer-Policy` and `X-Content-Type-Options`. Keep the CSP in `app/config/security.ts` aligned with any new external script, frame, font, image, or API origins.

## Theme

Theme mode is stored locally as a non-sensitive preference under `tv-theme-mode`; authenticated users also sync theme preferences through the backend profile. The global page shell and footer live in `app/root.tsx`. Keep footer surfaces theme-aware so dark mode does not render a light footer.

## Project Structure

```
app/
├── api/              # API client functions and types
│   ├── client.ts     # Fetch client, session credentials, CSRF handling
│   ├── auth.ts       # Session login/logout API calls
│   ├── trades.ts     # Trade API calls
│   ├── users.ts      # User API calls
│   └── types.ts      # TypeScript interfaces
├── auth/             # Authentication logic
│   ├── AuthProvider.tsx
├── components/       # Reusable components
│   ├── LoginCard.tsx
│   ├── MonthlyCalendar.tsx
│   ├── TradeDialog.tsx
│   └── TradesTable.tsx
├── config/           # SSR origin validation and security headers
│   └── security.ts
├── routes/           # Page components
│   ├── home.tsx      # Main trading journal page
│   ├── admin.tsx     # Admin panel
│   └── share.tsx     # Shared trade view
├── utils/            # Utility functions
│   └── shareLink.ts
├── __tests__/        # Test files
├── app.css           # Global styles
├── root.tsx          # Root component
└── routes.ts         # Route configuration
```

## Key Features Implementation

### Aggregate Statistics
- Loaded once on mount and auth change
- Not reloaded when changing calendar months
- Formatted with commas and "USD" suffix
- Uses `/api/v1/trades/stats` endpoint

### Monthly Calendar
- Click on days to filter trades table
- Shows daily P&L summaries
- Color-coded for wins/losses
- Uses `/api/v1/trades/summary?month=YYYY-MM` endpoint

### Trade Management
- Create/edit/delete trades
- Supports stocks and options (calls/puts)
- Multi-currency (USD/CAD)
- Long and short positions
- Automatic P&L calculation

### Guest Mode
- Trades stored in browser localStorage
- No authentication required
- Prompt to sign in for cloud sync

## Deployment (AWS App Runner)

This repo auto-deploys to **dev** on pushes to `main` (after CI tests pass). Production deploys are manual via `workflow_dispatch`.

### Build Args (Docker)

The Dockerfile accepts build arguments for runtime config:
```dockerfile
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_ADMIN_EMAILS
ARG VITE_USE_HEADER_AUTH=false
ARG VITE_APP_ENV
ARG VITE_PUBLIC_ORIGIN
ARG VITE_PUBLIC_HOST_ALLOWLIST
```

### GitHub Secrets (Dev)

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `DEV_ECR_TRADINGVIEW_REPO`
- `DEV_FRONTEND_SERVICE_ARN`
- `DEV_API_BASE_URL`
- `DEV_GOOGLE_CLIENT_ID`
- `DEV_ADMIN_EMAILS` (optional)
- `DEV_PUBLIC_ORIGIN`
- `DEV_PUBLIC_HOST_ALLOWLIST` (optional)

For the current dev frontend domain:
```text
DEV_PUBLIC_ORIGIN=https://dev.tradelog.ca
DEV_PUBLIC_HOST_ALLOWLIST=dev.tradelog.ca
```

### GitHub Secrets (Prod)

- `AWS_REGION`
- `AWS_ROLE_ARN` — IAM role ARN assumed by GitHub Actions OIDC, e.g. `arn:aws:iam::<account-id>:role/<frontend-github-actions-role-name>`
- `PROD_ECR_TRADINGVIEW_REPO` — ECR repository name only, e.g. `<prod-frontend-ecr-repo-name>`
- `PROD_FRONTEND_SERVICE_ARN` — App Runner service ARN, e.g. `arn:aws:apprunner:<region>:<account-id>:service/<service-name>/<service-id>`
- `PROD_API_BASE_URL` — production backend API base URL, e.g. `<prod-api-origin>/api/v1`
- `PROD_GOOGLE_CLIENT_ID`
- `PROD_ADMIN_EMAILS` (optional)
- `PROD_PUBLIC_ORIGIN`
- `PROD_PUBLIC_HOST_ALLOWLIST` (optional)

For the current production frontend domain:
```text
PROD_PUBLIC_ORIGIN=https://www.tradelog.ca
PROD_PUBLIC_HOST_ALLOWLIST=www.tradelog.ca
```

If `https://tradelog.ca` also reaches the React SSR app instead of only redirecting before the app, include it in `PROD_PUBLIC_HOST_ALLOWLIST`.

The frontend App Runner service stays public and does not need a VPC connector. Private Neon and DynamoDB access are backend-only concerns.

The detailed AWS/Neon private networking runbook lives in the backend repo at `transaction-api/docs/private-app-runner-neon.md`. It includes the prod VPC, App Runner, DynamoDB gateway endpoint, Neon PrivateLink endpoint, security group, and rollback debugging checklist.

Production public DNS currently treats `<prod-frontend-origin>` as canonical. The DNS provider can forward `<prod-root-origin>` to `<prod-frontend-origin>` with a permanent 301. Keep both origins in Google OAuth/CORS where relevant, but point `PROD_API_BASE_URL` at `<prod-api-origin>/api/v1`.

## CI/CD Pipeline

1. **Test** — Run vitest on all PRs and pushes
2. **Build** — Create Docker image with Vite build
3. **Push** — Upload to AWS ECR
4. **Deploy** — Update App Runner service

Manual prod deploys triggered via GitHub Actions `workflow_dispatch`.

## Tech Stack Details

- **React 19** — UI framework
- **TypeScript** — Type safety
- **Vite** — Fast builds and dev server
- **React Router Framework Mode** — SSR routing and builds
- **Material-UI (MUI)** — Component library
- **Fetch API** — HTTP client with cookie credentials and CSRF handling
- **Vitest** — Testing framework
- **Testing Library** — Component testing utilities

## Backend Repository

The companion backend API lives at: https://github.com/alexmcdermid/transaction-api
