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
| `HOST=0.0.0.0` with `EDGY_AUTH=local` | The server refuses to start: `EDGY_AUTH=local needs a loopback HOST; 0.0.0.0 can be reached from other machines` |

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

`npm run build` writes the app, the offline copy used by exports, and these docs into `dist/`. `npm start` then serves the app, the API and the docs from one process on `http://127.0.0.1:8787`; there is no Vite and no port 5173. It works the same on Windows, macOS and Linux (`scripts/start.mjs` sets `NODE_ENV=production` and runs the server), and it stops at once with `no build in dist/ — run npm run build first` when there is nothing built.

Stop it with Ctrl+C, or with `SIGTERM` from a service manager: timers and sync stop, open pages are told, and the database is closed with nothing half written (at most ten seconds later it exits anyway).

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
| `EDGY_SIGNUPS` | open | `off`: nobody new signs up once the server has its first account. See [Put it online](#put-it-online). |
| `ANTHROPIC_API_KEY` | none | Lets [Ask AI](/editor/ask-ai/) answer with Claude, in the server owner's documents. `EDGY_AI_MODEL` picks the model, `EDGY_AI=off` turns it off. |
| `EDGY_AI_USERS` | owner | `all`: Claude answers in every account's documents, on the owner's key. |
| `EDGY_SECRET_<NAME>` | none | A secret a [fetch](kind:fetch) cell's header can name as `secret:NAME`, in the owner's documents only. |

## Put it online

To let other people (or your other devices) reach edgy at an address of its own, run the built server on a machine that stays on and put a web server that speaks HTTPS in front of it, on the same machine: Caddy, nginx or another reverse proxy. edgy itself speaks plain HTTP and keeps listening on `127.0.0.1`; only the proxy faces the internet.

```text
npm ci
npm run build
EDGY_AUTH=accounts EDGY_DATA=/srv/edgy/data EDGY_WEB_URL=https://edgy.example.org npm start
```

A Caddy site for it is two lines; Caddy gets the certificate and adds the headers edgy reads:

```text
edgy.example.org {
  reverse_proxy 127.0.0.1:8787
}
```

What to set, and why:

- **`EDGY_AUTH=accounts`.** Behind a proxy every request comes from `127.0.0.1`, so edgy would otherwise choose local mode. It still treats proxied requests as coming from elsewhere (they carry `X-Forwarded-For`), but say it plainly.
- **`EDGY_WEB_URL`** to the public address, so the links agents and share links give out are the ones people open. Without it edgy works the address out from the proxy's `X-Forwarded-Proto` and `X-Forwarded-Host`.
- **`EDGY_SIGNUPS=off`** once you have made your own account, unless you want anyone who finds the address to make one. The first account is the server's owner.
- **`EDGY_DATA`** to a folder outside the code, and back it up. The database is SQLite in WAL mode: copy the folder while the server is stopped, or use `sqlite3 edgy.db ".backup backup.db"` while it runs.
- **A service manager** (systemd, pm2, a Windows service) that restarts it and stops it with `SIGTERM`.

The proxy must pass the `Host` header on (Caddy does; in nginx, `proxy_set_header Host $host;`) or send `X-Forwarded-Host`, send `X-Forwarded-Proto` and `X-Forwarded-For` (both do by default), and must not buffer `text/event-stream` answers (in nginx, `proxy_buffering off;` for `/api/`), which carry live changes.

What edgy does by itself on a server others can reach:

- Every answer says `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and that no other site may frame it.
- A request body is at most 16 MB (64 KB for sign-in and sign-up), and is read only once the asker is known.
- Failed sign-ins and new accounts are slowed down per address, the address the proxy saw.
- The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when the proxy says the browser used HTTPS.
- Fetch cells can't reach private or local addresses, at most 32 of them are on the network at once, and each is cut off at 10 seconds and 1 MB.
- Claude and the server's secrets are spent only for the owner's documents.
- An `/api` address that doesn't exist answers JSON `404`; the built app's pages are sent with `Cache-Control: no-cache` and its bundles, named by their content, are kept by browsers for a year.

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
- **`npm start` says there is no build.** Run `npm run build` first.
- **Behind a proxy, every change says *a page on another site can not change edgy*.** The proxy doesn't tell edgy the address the browser used: make it pass `Host` and `X-Forwarded-Proto` on (see [Put it online](#put-it-online)), or set `EDGY_WEB_URL` to the public address.

Next: [The screens](/start/screens/).
