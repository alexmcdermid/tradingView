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
```

### Variable Descriptions

**Required:**
- `VITE_API_BASE_URL` — Backend API base URL (e.g. `https://dev-api.tradelog.ca/api/v1`)
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID for authentication

**Optional:**
- `VITE_ADMIN_EMAILS` — Comma-separated list of admin email addresses
- `VITE_USE_HEADER_AUTH` — Enable header-based auth for development (set to `false` in production)
- `VITE_USER_ID` — Default user ID for header-based auth (dev only)
- `VITE_APP_ENV` — Environment label shown in share links (e.g. "dev", "prod")

## Project Structure

```
app/
├── api/              # API client functions and types
│   ├── client.ts     # Axios client setup
│   ├── trades.ts     # Trade API calls
│   ├── users.ts      # User API calls
│   └── types.ts      # TypeScript interfaces
├── auth/             # Authentication logic
│   ├── AuthProvider.tsx
│   └── authToken.ts
├── components/       # Reusable components
│   ├── LoginCard.tsx
│   ├── MonthlyCalendar.tsx
│   ├── TradeDialog.tsx
│   └── TradesTable.tsx
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
```

### GitHub Secrets (Dev)

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `DEV_ECR_TRADINGVIEW_REPO`
- `DEV_FRONTEND_SERVICE_ARN`
- `DEV_API_BASE_URL`
- `DEV_GOOGLE_CLIENT_ID`
- `DEV_ADMIN_EMAILS` (optional)

### GitHub Secrets (Prod)

- `PROD_ECR_TRADINGVIEW_REPO`
- `PROD_FRONTEND_SERVICE_ARN`
- `PROD_API_BASE_URL`
- `PROD_GOOGLE_CLIENT_ID`
- `PROD_ADMIN_EMAILS` (optional)

## CI/CD Pipeline

1. **Test** — Run vitest on all PRs and pushes
2. **Build** — Create Docker image with Vite build
3. **Push** — Upload to AWS ECR
4. **Deploy** — Update App Runner service

Manual prod deploys triggered via GitHub Actions `workflow_dispatch`.

## Tech Stack Details

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Fast builds and dev server
- **React Router** — Client-side routing
- **Material-UI (MUI)** — Component library
- **Axios** — HTTP client
- **Vitest** — Testing framework
- **Testing Library** — Component testing utilities

## Backend Repository

The companion backend API lives at: https://github.com/alexmcdermid/transaction-api
