---
title: Install and run
---

This page gets edgy running on your machine, from `npm install` to a document open in the browser, and says what starts where, what is saved, and which switches change that.

## What you need

- **Node 22.13 or newer.** edgy keeps its documents in SQLite through `node:sqlite`, which older versions of Node don't have. npm comes with Node.
- **A current web browser.**
- Nothing else: no database to install, no account to make. The documents live in a file on your disk.

## Start it

From the repository's folder:

```text
npm install
npm run dev
```

Then open `http://localhost:5173`.

`npm run dev` runs `scripts/dev.mjs`, which starts two programs side by side and stops both when either one stops:

| Program | Where | What it does |
| --- | --- | --- |
| The API | `http://127.0.0.1:8787` | Keeps the documents, records and accounts; runs timers and fetches; serves the [docs](#the-documentation). It restarts itself when you change one of its files. |
| The web app | `http://localhost:5173` | The editor, built by Vite. It sends `/api`, `/assets` and `/docs` on to the API, so you only open this address. |

The terminal prints one line when the API is ready:

```text
edgy api on http://127.0.0.1:8787  (data in …/data; local mode: this machine is signed in; sync off)
```

If you see **The server did not answer** in the browser, the API isn't running: check that `npm run dev` is still going.

## The first run

On the first visit edgy makes a local account and gives it one document, **Start here**, a short tour you can change as you like. Open it, press a **+** on a cell's edge, and see [The screens](/start/screens/) for what is around you.

Everything is kept in a `data/` folder in the directory you started from:

| Path | What is in it |
| --- | --- |
| `data/edgy.db` | The SQLite file: documents and their history, records, accounts. |
| `data/assets/` | Pictures you upload into [image](kind:image) cells. |

Back up or move edgy by copying the folder while the server is stopped. `EDGY_DATA` points edgy at another folder.

## Local mode and accounts mode

edgy runs in one of two modes, chosen when the server starts.

**Local mode** is what you get with nothing configured. You are signed in as the local account without signing up, and agents on this machine need no key. It exists for a machine that is yours alone, so edgy turns it on only while nobody else can reach the server.

**Accounts mode** asks everyone to sign in with an email and a password. See [Accounts](/people/accounts/).

| You start it with | Mode |
| --- | --- |
| Nothing (the server listens on `127.0.0.1`) | Local |
| `EDGY_AUTH=accounts` | Accounts, even on this machine |
| `HOST=0.0.0.0` (or any address other machines can reach) | Accounts |
| `HOST=0.0.0.0` with `EDGY_AUTH=local` | The server refuses to start: `EDGY_AUTH=local needs a loopback HOST` |

Only `127.0.0.1`, `localhost` and `::1` count as loopback. Even in local mode, a request is trusted as "this machine" only when it comes from this computer, carries no proxy headers (`Forwarded`, `X-Forwarded-For`, `X-Real-IP`) and names a loopback host. Behind a proxy that adds those headers, everyone signs in.

To try accounts mode on your own machine:

```text
EDGY_AUTH=accounts npm run dev
```

On Windows PowerShell, set the variable first: `$env:EDGY_AUTH = "accounts"; npm run dev`. The browser then opens the sign-in page, described in [The screens](/start/screens/#sign-in).

## Run it as one process

`npm run dev` is for working on edgy. To use it, build once and start one program:

```text
npm run build
npm start
```

`npm run build` writes the app, the offline copy used by exports, and these docs into `dist/`. `npm start` then serves the app, the API and the docs from one process on `http://127.0.0.1:8787`; there is no Vite and no port 5173.

> [!NOTE]
> The `start` script puts `NODE_ENV=production` in front of the command, which only Unix shells understand. On Windows, set the variable yourself and run the server directly: `$env:NODE_ENV = "production"; npx tsx --disable-warning=ExperimentalWarning src/server/index.ts`. The server only serves the built app when `NODE_ENV` is `production` and `dist/index.html` exists.

## Switches

All of these are environment variables, set before the command.

| Variable | Default | What it does |
| --- | --- | --- |
| `EDGY_PORT` | `8787` | The port the API listens on. |
| `HOST` | `127.0.0.1` | The address it listens on. A non-loopback address means accounts mode. |
| `EDGY_AUTH` | by `HOST` | `local` or `accounts`, as above. |
| `EDGY_DATA` | `./data` | Where `edgy.db` and `assets/` live. |
| `EDGY_DIST` | `dist` | Where the built app is read from. |
| `WEB_PORT` | `5173` | The port Vite uses in `npm run dev`. It stops if the port is taken. |
| `EDGY_URL` | `http://127.0.0.1:8787` | Where Vite sends `/api` (and where the MCP server finds edgy). Set it when you move the API with `EDGY_PORT`. |
| `EDGY_WEB_URL` | `http://localhost:5173` in development | The address agents give people to open a document. |
| `TURSO_URL`, `TURSO_AUTH_TOKEN` | none | Turn sync on; see below. |
| `EDGY_SYNC_INTERVAL` | `3000` | How often, in milliseconds, this machine asks the cloud for news. |

## Sync between machines

By default your documents stay on this machine and the top bar says **Sync off**. To keep the same account on several machines, give edgy a [Turso](https://turso.tech) database. Put its address and a token in a file named `.env` in the repository folder (it is ignored by git, so it stays out of commits):

```text
TURSO_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=…
```

and start with:

```text
npm run dev:sync
```

`dev:sync` is `npm run dev` with `.env` loaded, so the file has to exist. You can also put both variables in the environment and use `npm run dev` or `npm start`. Sync turns on only when both are set. The badge in the top bar then says **Synced**, **Syncing** or **Offline**. See [Sync](/people/sync/) for how conflicts are settled and what travels.

## Agents

An agent works on your documents through the MCP server:

```text
npm run mcp
```

You don't run this by hand. It speaks MCP over standard input and output, and an agent such as Claude Code starts it for itself from the repository's `.mcp.json`. The edgy API has to be running too, because the server passes every tool call on to it at `EDGY_URL`. In accounts mode the agent also needs an API key in `EDGY_API_KEY`. See [The MCP server](/agents/mcp/) and [API keys](/people/api-keys/).

## The documentation

These docs are served by the API at `/docs/`: `http://localhost:5173/docs/` in development, `http://127.0.0.1:8787/docs/` after `npm start`. The library, the Data page, Profile and the editor each have a **Docs** button that opens them in a new tab.

In development the docs are built the first time you open them, which takes a moment, and not again until the API restarts. A change to a page shows after you restart `npm run dev`.

## When it won't start

- **Port 5173 is taken.** Vite is told to use that port or stop, and then the script stops the API too. Free the port, or choose another with `WEB_PORT`.
- **Port 8787 is taken.** Choose another with `EDGY_PORT`, and set `EDGY_URL` to match so the web app finds it.
- **It stops straight away on an old Node.** Check `node --version`; you need 22.13 or newer.
- **`npm run dev:sync` stops at once.** The `.env` file isn't there. Make it, or use `npm run dev`.
- **The browser shows a sign-in page and you expected none.** The server is in accounts mode: `HOST` or `EDGY_AUTH` is set. Unset them, or sign in.

Next: [The screens](/start/screens/).
