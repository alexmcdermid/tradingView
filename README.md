# TradingView Frontend

React Router + MUI frontend for a lightweight day-trade journal. It talks to the Spring Boot backend at `/api/v1/trades` (repo: https://github.com/alexmcdermid/transaction-api), letting you log stock/option trades and see realized P/L rollups by day and month.

Runtime config (Vite env vars/build args):
- `VITE_API_BASE_URL` (e.g. `https://dev-api.tradelog.ca/api/v1`)
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_ADMIN_EMAILS` (comma-separated, optional)
- `VITE_USE_HEADER_AUTH` (dev-only; set `false` for prod)
- `VITE_USER_ID` (dev-only, optional)
- `VITE_APP_ENV` (optional label for share links)

## Scripts

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Type-check:

```bash
npm run typecheck
```

Build for production:

```bash
npm run build
```

## Deployment (AWS App Runner)
This repo auto-deploys to the **dev** environment on pushes to `main` (after CI tests pass). Production deploys are manual via `workflow_dispatch`. The frontend is served via App Runner with a custom domain (e.g. `https://dev.tradelog.ca`).

Required GitHub secrets (dev):
- `AWS_REGION`
- `AWS_ROLE_ARN`
- `DEV_ECR_TRADINGVIEW_REPO`
- `DEV_FRONTEND_SERVICE_ARN`
- `DEV_API_BASE_URL`
- `DEV_GOOGLE_CLIENT_ID`
- `DEV_ADMIN_EMAILS` (comma-separated, optional)

Required GitHub secrets (prod):
- `PROD_ECR_TRADINGVIEW_REPO`
- `PROD_FRONTEND_SERVICE_ARN`
- `PROD_API_BASE_URL`
- `PROD_GOOGLE_CLIENT_ID`
- `PROD_ADMIN_EMAILS` (comma-separated, optional)
