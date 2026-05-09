# Kuros Manager

Personal productivity hub. Pulls from Slack and Outlook, summarizes via Claude, surfaces daily/weekly summaries, action items, risks, and person/team insights through a local web UI.

- **Architecture & rationale:** [PLAN.md](PLAN.md)
- **Implementation spec (source of truth):** [IMPLEMENTATION.md](IMPLEMENTATION.md)

## Quick start

Prereqs: Node ≥ 20.11, pnpm ≥ 9, Docker (or local Postgres 16), an Anthropic API key.

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY at minimum
pnpm install
pnpm db:up           # starts postgres in docker
pnpm db:migrate      # creates schema and tables
pnpm dev             # runs backend (3000) and frontend (5173) in parallel
```

## Layout

- `apps/backend` — NestJS API + scheduler
- `apps/frontend` — React + MUI SPA
- `packages/shared` — shared TS types
- `data/` — gitignored runtime markdown store

## Connector setup

See IMPLEMENTATION.md §12 (Slack) and §13 (Outlook) for the manual setup steps the user must complete in Slack/Azure before the connector can run.
