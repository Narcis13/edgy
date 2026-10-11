---
title: Accounts
---

An account is who you are in edgy: it owns your documents, is named in presence and Activity, and signs in with an email and a password; this page covers signing up, signing in and out, local mode, the profile, throttled sign-ins and sessions.

::shot signin "The sign-in page. In local mode it also offers to continue as the local account."

edgy runs in one of two modes, and which one decides whether you meet the sign-in page at all.

## Local mode and accounts mode

| | Local mode | Accounts mode |
| --- | --- | --- |
| When | The server listens only on this machine (`HOST` is `127.0.0.1`, `localhost` or `::1`, the default). | The server listens where other machines can reach it, or you ask for it. |
| Signing in | None. You are the **local account**, named **You**, with no email and no password. | Everyone signs in, on this machine too. |
| Agents on this machine | Need no [API key](/people/api-keys/). | Need a key. |

edgy chooses by itself: **local** when `HOST` is a loopback address, **accounts** otherwise. Set `EDGY_AUTH` to `accounts` or `local` to say it yourself.

```bash
HOST=0.0.0.0 npm run dev        # reachable from other machines: accounts mode
EDGY_AUTH=accounts npm run dev  # this machine signs in too
```

`EDGY_AUTH=local` with a `HOST` that other machines can reach stops the server at start: *EDGY_AUTH=local needs a loopback HOST*. A server other people can open must ask who they are.

### What local mode means

The first time you open edgy it makes the local account, with the tour document, and every request that comes from this machine and carries no session and no key is that account. You open edgy straight into the [library](/library/).

The request must really come from here: its connection is from the loopback address, its `Host` is a loopback name, and no proxy forwarded it (a `Forwarded`, `X-Forwarded-For` or `X-Real-IP` header means it did not come from here). A web page that points its own name at `127.0.0.1` is not this machine.

Everything else still works in local mode: you can sign up, sign in as someone else, and make keys. Your avatar menu says **Local account, no sign-in needed**, and its sign-out entry reads **Sign in as someone else**. On the sign-in page, **Continue as You** takes you back, with the note *This computer needs no sign-in.* To use the local account on another machine through [sync](/people/sync/), give it an email and a password in your profile.

## Signing up

Open `/signup` (the sign-in page has **Create an account**).

- **Name**, optional. Without one, the part of your email before the `@`.
- **Email**. Stored lower-cased and trimmed.
- **Password**, at least 8 characters.

You are signed in at once and start with a short tour document. Anyone who can reach the server can sign up; on a server open to the world, put your own sign-up policy in front of it. The first account made on an installation that already had documents owns all of them.

An email can belong to one account: *An account with this email already exists. Sign in instead.* With [sync](/people/sync/), that includes accounts made on your other machines.

## Signing in and out

Open `/signin`, or open any page: signed out, every page but the sign-in, sign-up and [share link](/library/share-links/) pages sends you to the sign-in page, and after you sign in you land where you were going.

A wrong email and a wrong password get the same answer, **Wrong email or password.**, so the page never says which emails exist.

To sign out, open your avatar menu in the top bar and choose **Sign out**. It ends the session in this browser only; your other browsers stay signed in. In local mode, if you had signed in as someone else, you land in the library as the local account.

## The profile

**Profile** in the avatar menu (or in the **More** menu on a phone) opens `/profile`. Each section saves on its own and says so: **Saved.**, or **Password changed.** for the password.

::shot profile "The profile: you, password, theme, API keys, and the way out."

| Section | What you can change |
| --- | --- |
| **You** | **Display name** (up to 60 characters), your **Colour** (ten, from **Blue** to **Indigo**) and **Email**. Your avatar is your initials on that colour. A new name or colour shows in [presence](/people/presence/) and in [Activity](/editor/activity/), including on changes you made before. |
| **Password** | **Change password** needs the current one, then the new one twice (8 to 200 characters). It signs you out everywhere else; this browser stays signed in. An account that has no password yet (the local account) sees **Set password**, and needs an email first. |
| **Theme** | **Light**, **Dark** or **Same as the system**. It is kept with your profile, so every browser you sign in on looks the same. |
| **API keys** | Keys for agents. See [API keys](/people/api-keys/). |
| **Delete account** | **Delete account…** |

An email another account uses is refused: *Another account uses that email.*

### Deleting an account

The dialog says what goes: your documents, decks, records and keys are deleted, and your access to other people's documents ends. The changes you made in their documents stay, with your name as plain text. It asks for your password (an account without one asks you to type the account's name) and cannot be undone. With sync, your space in the cloud is deleted too.

## Throttled sign-ins

Guessing a password gets slower the more you guess. After failed sign-ins, the page answers **Too many tries. Wait 12 seconds and try again.** (HTTP 429, with a `retry-after` header), and the button counts down: **Wait 12s**.

edgy counts failures three ways, over 15 minutes:

| Counted by | Free failures | Then |
| --- | --- | --- |
| This email from this address | 4 | The fifth failure waits 2 seconds, the next 4, then 8, doubling up to 5 minutes. |
| This email from anywhere | 50 | Same doubling. |
| This address, any email | 30 | Same doubling. |

The strict limit is on the email and the address together, so someone guessing at your account from elsewhere can't lock you out of it quickly. A right password clears the count for that email and address. The counts live in memory; restarting the server clears them.

## Sessions

A sign-in makes a session: a random 32-byte secret in the `edgy_session` cookie (`HttpOnly`, `SameSite=Lax`, and `Secure` over https). It lasts 30 days and is renewed while you use it. The server keeps only its SHA-256, so a stolen database holds no live cookies, and sessions survive a restart.

- **Sign out** ends this browser's session.
- **Change password** ends every other session, and closes the documents they had open.
- **Deleting the account** ends all of them.
- A session that runs out while a document is open says **Signed out**, with a button to sign in.

edgy does not list your sessions. A write made with the cookie must come from edgy's own pages, so another site can't change your documents. Passwords are kept as scrypt hashes, never as text.

## For agents and scripts

| Route | For |
| --- | --- |
| [POST /api/auth/signup](route:POST /api/auth/signup) | Make an account and sign in |
| [POST /api/auth/signin](route:POST /api/auth/signin) | Sign in |
| [POST /api/auth/signout](route:POST /api/auth/signout) | Sign out |
| [GET /api/me](route:GET /api/me) | Who is asking, and the mode (`auth`) |
| [PATCH /api/me](route:PATCH /api/me) | Name, colour, theme, email |
| [POST /api/me/password](route:POST /api/me/password) | Change the password |
| [DELETE /api/me](route:DELETE /api/me) | Delete the account |

The profile, keys, password and sign-out are for a person, not for an agent with their key: they answer 403, *an API key can not do that; sign in in the browser*. [GET /api/health](route:GET /api/health) is open to anyone and says whether you are signed in.

## Under the hood

Hashing, sessions and the throttle are in [auth.ts](src:src/server/auth.ts); who may do what is in [access.ts](src:src/server/access.ts); the routes are in `app.ts`. The pages are in `src/web/account/`: [SignIn.tsx](src:src/web/account/SignIn.tsx), [Profile.tsx](src:src/web/account/Profile.tsx). See [how access works](/internals/access/).
