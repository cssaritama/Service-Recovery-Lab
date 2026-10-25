# 0004 — One edge-serverless artifact for local, Docker and cloud

**Status:** Accepted · **Date:** 2026-10-25

## Context
The system must:
- run publicly at zero cost;
- start with one command for reviewers;
- behave identically everywhere.

## Decision
A single Cloudflare Worker serves the React UI and the API, with D1 (SQLite) for persistence and Drizzle SQL migrations. The same Worker runs on `workerd` locally and in Docker, and on Cloudflare Workers in the cloud. State is one document per workspace, updated by optimistic concurrency.

## Alternatives considered
- **Container on a VM with PostgreSQL.** A familiar stack, but with a running cost and differences between environments.
- **Separate frontend and backend services.** More moving parts and no benefit at this scale.

## Consequences
There is one artifact and one runtime, and environment drift is minimal. D1's limits (no long-lived cross-request transactions) are handled with revision compare-and-swap. If the system grows past one document per workspace, moving to normalised tables is a known path.
