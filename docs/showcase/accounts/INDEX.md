# Accounts, collaboration and cloud sync: evidence

Regenerated from fresh servers with empty data:

| script | what it does |
| --- | --- |
| `shoot.sh` | port 8792 (accounts mode) seeded by `seed.mjs` (Ana Pop, Ben Ortiz, Cleo Diaz); sign-in, slowing down, signed out, profile, keys, people, two people in one document, a viewer, access taken away; port 8793 in local mode. Writes `auth.txt`, `together.txt` and the screenshots |
| `SHOTS=1 sync.sh` | two servers (8795, 8796), one account, the real Turso database in `.env` through `cloud-gate.mjs` (9900), which holds the token and cuts the cloud off and on. Writes `sync.txt` and `sync-*.png`; removes everything it made in the cloud |
| `mcp-check.mjs` | the real MCP server with an API key against a fresh accounts-mode server: `mcp.txt` |
| `migration.sh` | a database made by the code before accounts (commit `056806e`), opened by this version: `migration.txt` |

Expected console lines: `wrong-password.png` and `slowed.png` record the 401 and 429 that sign-in answers there; every other screenshot is free of console and network problems.

| # | criterion | files |
| --- | --- | --- |
| A1 | Sign up, sign out, sign in at desktop and phone; a clear message for a wrong password; repeated failures slowed; scrypt with a salt; HttpOnly, SameSite cookie | `signin.png`, `signin-phone.png`, `signup-dark.png`, `signup-phone.png`, `signed-in-back.png`, `wrong-password.png`, `slowed.png`, `auth.txt` (cookie flags, stored hashes, the tries and their answers); `src/server/accounts.test.ts` |
| A2 | Signed out, pages lead to sign-in and back; the API answers 401; the route table is walked by a test | `signed-out.png`, `signed-in-back.png`, `auth.txt` (401 on every route tried; health public); `accounts.test.ts` ("the route table …") |
| A3 | B can't reach A's document on any route until given access; a viewer can't post ops, an editor can; access taken away at once, an open stream included | `viewer.png`, `revoked.png`, `together.txt` (Cleo's op refused, then 404 after removal); `accounts.test.ts` (every route as a stranger, the stream closed on removal) |
| A4 | A database from before accounts: the first account owns everything, nothing lost | `migration.txt` |
| C1 | Two people in one document: presence, the selected cell, an edit on the other side within a second, simultaneous edits survive, both names in Activity | `together-ana.png`, `together-ben.png`, `together.txt` (latency both ways, both values kept, the log's names) |
| P1 | A new name shows in presence and Activity; a new password ends the other sessions; deleting asks first | `renamed.png`, `profile.png`, `profile-phone.png`, `profile-tablet-dark.png`, `delete-dialog.png`, `auth.txt`; `accounts.test.ts` ("profile: …") |
| K1 | API keys: shown once, through MCP only the person's documents, an op traced as the agent for them; revoked or missing keys fail clearly on every tool; the key appears nowhere afterwards | `key-created.png`, `mcp.txt`; `accounts.test.ts` ("API keys …") |
| D1 | Collections per owner: B reads none of A's records by name, by `(rows …)` or beyond what a shared document reaches | `viewer.png` (Cleo sees Ana's saved quotes through Ana's document), `seed.mjs` (two "quotes" collections); `accounts.test.ts` ("collections belong to their owner …") |
| S1 | Two instances, one account, Turso: a document appears on the other; edits both ways; offline edits delivered, logs equal; conflicts as decided; the badge shows synced, syncing, offline | `sync.txt`, `sync-synced.png`, `sync-two.png`, `sync-offline.png`, `sync-offline-phone.png`, `sync-merged.png`; `src/server/sync.test.ts` |
| S2 | Without the Turso variables: local only, the badge says Sync off | `profile.png`, `library-ana.png` (Sync off in the top bar); `sync.test.ts` ("without the cloud …") |
| S3 | Pulls read from an index, an idle pull reads one row, cleanup leaves nothing | `sync.txt` (query plan, rows read while idle, row counts, nothing left) |
| L0 | `npm run dev` with nothing configured: no sign-in, agents need no key | `local-mode.png`, `auth.txt` (local mode lines) |
| — | Mine and Shared with me; people in the Share dialog | `library-ana.png`, `shared-with-me-ben.png`, `shared-with-me-phone.png`, `shared-with-me-tablet-dark.png`, `share-people.png`, `share-people-phone.png` |
