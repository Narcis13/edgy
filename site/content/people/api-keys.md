---
title: API keys
---

An API key lets an agent or a script act for you: it is a secret you make in your profile, shown once, that you give to the MCP server or put in a request header; this page covers making, using and revoking keys, and what an agent with one can do.

::shot api-keys "The API keys section of the profile. Each key shows its name, its first characters and when it was made and last used."

A key belongs to one person. Whatever uses it is that person as far as access goes, so it sees and changes only what you can. Its changes are shown as the agent acting for you.

## Making a key

1. Open your avatar menu and choose **Profile**, then find **API keys**.
2. Give the key a **Name** that says what will use it: *Claude on my laptop*. Without one it is called *Agent*. The name can be 60 characters long.
3. Choose **Create key**.

The key appears once, in a box that starts with its name and says *Copy it now: it won’t be shown again.* Choose **Copy** (if your browser won't copy, it is selected for you to copy by hand). Under it are the two lines the MCP server needs, with the address you opened edgy at:

```text
EDGY_URL=http://127.0.0.1:8787
EDGY_API_KEY=edgy_…
```

Choose **I have copied it** when you have. After that the key can't be read again: edgy keeps only a digest of it, not the key. If you lose it, make another and revoke the lost one.

A key starts with `edgy_` followed by 43 random characters, so it is easy to spot in a settings file and in a leak scan. Treat it like a password: don't put it in a document, a repository or a chat.

Make one key per thing that uses it. When a laptop is lost you revoke that laptop's key and nothing else stops.

## Seeing and revoking keys

Each key in the list shows its name, its first characters (`edgy_Ab3xYz…`), when it was made, and when it was **used** (or **never used**). The use time is updated at most once a minute.

**Revoke** asks first: *Whatever uses this key stops working at once. This can’t be undone; make a new key to replace it.* A revoked key stays in the list, marked **Revoked** with the time. Any live connection the key had open to a document is closed at once.

Changing your password does not revoke keys: a key is a separate, long-lived credential with its own revoke. Deleting your account removes them all.

## Using a key

### With MCP

Set `EDGY_API_KEY` next to `EDGY_URL` in the MCP server's settings, for example in a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "edgy": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": {
        "EDGY_URL": "http://127.0.0.1:8787",
        "EDGY_API_KEY": "edgy_paste-your-key-here",
        "EDGY_AGENT_NAME": "Claude"
      }
    }
  }
}
```

`EDGY_AGENT_NAME` is the name Activity shows for the agent (it is **Claude** when you leave it out). Every [tool](/agents/mcp/) sends the key with each request, and never prints it.

If the key is missing, every tool says: *Edgy needs an API key: sign in to edgy, open Profile → API keys, create one, and set EDGY_API_KEY next to EDGY_URL in the MCP server's settings.* If it is wrong or revoked, they say *Edgy refused the API key in EDGY_API_KEY*, and why.

### With HTTP

Send the key in an `Authorization` header on any request to the [API](/agents/http/):

```bash
curl http://127.0.0.1:8787/api/docs -H "authorization: Bearer $EDGY_API_KEY"
```

That lists your documents. Only a header that starts with `edgy_` counts as a key; any other `Authorization` (a proxy's basic auth, say) is left alone and your session cookie, if any, speaks instead. A request with a key needs no `Origin` check, because the key is its own proof that it came from you.

| Answer | Meaning |
| --- | --- |
| 401, *this API key is not valid; make one in your profile (Profile → API keys)* | The key is not one edgy knows. |
| 401, *this API key was revoked; make a new one in your profile* | You revoked it. |
| 401, *this API key belongs to an account that no longer exists* | The account was deleted. |

## What an agent with your key can do

Everything you can do with the documents you can reach, and nothing more. Its [role](/people/sharing/) on a document is yours: on a document you own it can change anything; on one where you are a viewer it can read but gets *you can view this document, not change it*; on a document you have no access to it gets a 404, as you would.

It cannot do what only a person can do in the browser: change your profile, your password or your keys, sign out, or delete the account. Those answer 403, *an API key can not do that; sign in in the browser*. So a leaked key can't take over your account, or make more keys.

In [Activity](/editor/activity/), what the agent does is named after both of you: **Claude for Ana**. The first part is the name the agent gave itself (`EDGY_AGENT_NAME`), or if it gave none, the key's name; the second is you. The server adds the *for Ana* part from the key, not from what the agent says, so an agent can't claim to act for someone else.

## Local mode needs no key

In [local mode](/people/accounts/#local-mode-and-accounts-mode) an agent on the same machine as edgy needs no key: a request from this machine with no credential is the local account's. A key you make in local mode works too. A key is needed as soon as edgy asks people to sign in (a server other machines can reach, or `EDGY_AUTH=accounts`).

Keys belong to one server. They are not copied by [sync](/people/sync/): an agent on another machine uses a key made on that machine.

## For scripts

| Route | For |
| --- | --- |
| [GET /api/me/keys](route:GET /api/me/keys) | Your keys, without the secrets |
| [POST /api/me/keys](route:POST /api/me/keys) | Make one: `{"name": "Claude on my laptop"}`. The answer holds the key, once. |
| [DELETE /api/me/keys/:key](route:DELETE /api/me/keys/:key) | Revoke by the key's id |

These three are for a person signed in in the browser; a key can't make or revoke keys. Keys are made by [auth.ts](src:src/server/auth.ts) and kept as digests by [store.ts](src:src/server/store.ts); the page is [Keys.tsx](src:src/web/account/Keys.tsx).
