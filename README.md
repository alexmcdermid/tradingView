# TradingView - Day Trading Journal

A web application for tracking day trading performance. Log your stock and option trades, visualize your P&L over time, and analyze your best performing days and months.

## What it does

This trading journal helps you:
- **Log trades quickly** - Record stocks and options (calls/puts) with a simple form
- **Track performance** - View your total realized P&L, trade count, and best day/month statistics
- **Browse by month** - Monthly calendar view with daily P&L summaries
- **Multi-currency** - Supports both USD and CAD trades with automatic conversion to USD
- **Share trades** - Generate shareable links for individual trades (with optional expiration)
- **Guest mode** - Try it out without signing in (trades stored locally)

## Features

- **Real-time Statistics** - See total P&L, best day, and best month across all your trades
- **Interactive Calendar** - Click on any day to view trades for that date
- **Trade Table** - Sortable, paginated table with all trade details
- **Performance Formatting** - Color-coded P&L (green for profits, red for losses)
- **Responsive Design** - Works on desktop and mobile
- **Google Sign-In** - Secure authentication with your Google account
- **Admin Panel** - View all users and their activity (admin-only)

## Tech Stack

- React 18 with TypeScript
- Material-UI (MUI) components
- React Router for navigation
- Vite for fast builds
- Vitest for testing
- Deployed on AWS App Runner

## Development

See [DEV.md](DEV.md) for setup instructions, build commands, and deployment details.
