# PaindaProtocol – Packages

This repo contains only the **packages** (protocol + modules). Apps (web, bench-server, etc.) live in the full monorepo elsewhere.

## Packages

| Package | Description |
|---------|-------------|
| `@painda/core` | Binary protocol, PPServer, PPClient, typed contracts |
| `@painda/gaming` | Delta engine, state sync |

## Install & build

```bash
npm install
npm run build
```

## Push (from full monorepo)

The root `package.json` in this repo is **packages-only** (workspaces: `packages/*`). To push package updates from a full monorepo, use the packages-only root `package.json` for the commit, then push. Local full monorepo keeps `package.json.full` for apps.
