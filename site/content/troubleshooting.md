---
title: Troubleshooting
---

This page lists the messages you may see in edgy, grouped by where they appear, with what each one means and what to do about it.

Messages are quoted as edgy writes them. A `…` stands for a name, a number or a reason that changes: a cell's name, an address, the rest of the sentence. Search the page (press `/`) for the words you see.

## Starting the server

These appear in the terminal where you started edgy, or in the browser when the server is not there. Starting it is covered in [Install and run](/start/install/).

| You see | What it means | What to do |
| --- | --- | --- |
| `edgy api on http://127.0.0.1:8787  (data in …; local mode: this machine is signed in; sync off)` | Not a problem: the server is ready. It says its address, where the data is, the mode (`local mode: this machine is signed in`, or `accounts: sign in to use it`) and whether sync is on. | Open the app. |
| `EDGY_AUTH=local needs a loopback HOST; … can be reached from other machines` | You asked for local mode, where nobody signs in, but `HOST` makes the server reachable from other machines. The server stops. | Remove `EDGY_AUTH=local` so everyone signs in, or set `HOST` back to `127.0.0.1`. |
| `Error: listen EADDRINUSE …` | Another program already uses the port. This is Node's message, not edgy's. | Stop that program, or choose another port with `EDGY_PORT` (the API) or `WEB_PORT` (the web app). |
| `[api] stopped` or `[web] stopped` | `npm run dev` runs the API and the web app side by side and stops both when either stops. The web app is started with `--strictPort`, so it stops when its port is taken instead of moving to another. | Read the lines above it for the reason, free the port, and start again. |
| **The server did not answer**, then "Is `npm run dev` running? This page tries again when you reload it." | The page loaded but the API did not answer. | Look at the terminal. Start the server if it stopped, then reload. |
| **The server did not answer**, then "Try again in a moment." | The same, on a page opened with a [share link](term:share-link). | Wait, then reload. If it stays, tell the person who shared it. |
| `The docs are not built. Run npm run docs:build (npm run build does it too).` | You opened `/docs/` on a production server whose build has no docs. | Run `npm run docs:build`, then restart. |
| `The docs could not be built: …` | In development the server builds the docs once, on the first visit to `/docs/`, and that failed. | Read the reason, fix it, and restart the server: it builds them only once per start. |

If the server will not start at all and the error mentions `node:sqlite`, your Node is older than 22.13. edgy keeps its documents in SQLite through that module.

## Signing in

| You see | What it means | What to do |
| --- | --- | --- |
| The sign-in page, when you expected your documents | The server is in accounts mode, your session ended (a session lasts 30 days without use), or you are in local mode but reached the server by a name that is not this machine, or through a proxy. | Sign in. In local mode, open `http://localhost:5173` (or `http://127.0.0.1:8787`), not the machine's network name. See [Accounts](/people/accounts/). |
| `Wrong email or password.` | The pair does not match an account. The message is the same when the email has no account. | Check both. edgy has no password-reset page. |
| `Too many tries. Wait … seconds and try again.` | After several wrong passwords in a row, sign-in makes you wait: 2 seconds at first, doubling each time, up to 5 minutes. The count ticks down on the page. | Wait for it to end. Someone else failing to sign in as you does not lock you out. |
| `A password needs at least 8 characters.` | Sign-up or a new password is too short. | Use 8 characters or more. |
| `That password is longer than 200 characters.` | Too long. | Shorten it. |
| `That is not an email address.` | The email is not in the form `ana@example.test`. | Fix it. |
| `An account with this email already exists. Sign in instead.` | The email is taken. | Sign in, or use another email. |
| `The cloud cannot be reached to check this email. Try again in a moment.` | [Sync](/people/sync/) is on and the cloud did not answer when edgy checked whether the email exists on another machine. | Wait, and try again. |
| **Signed out**, then "You were signed out." | While you had a document open, your session ended: you signed out in another tab, or changed your password in another browser. | Choose **Sign in**. |
| **Account deleted**, then "This account was deleted." | The account you were using no longer exists. | Make a new account. |

### Profile and API keys

| You see | What it means | What to do |
| --- | --- | --- |
| `The two new passwords differ.` | The new password and its repeat are not the same. | Type both again. |
| `The current password is wrong.` | The current password you typed is not the account's. | Type it again. |
| `A name can not be empty.` | The name field was left blank. | Give a name. |
| `Another account uses that email.` | That email belongs to someone else. | Use another. |
| `Give the account an email first, so it can sign in with it.` | You tried to set a password on an account that has no email. | Add an email first. |
| `The password is wrong.` or `Type the account name to confirm.` | Deleting an account asks for its password, or for its name when it has none. | Type it exactly. |
| `no such key` | The key is already gone, or is not yours. | Reload the list. |

See [API keys](/people/api-keys/) for making and revoking keys.

## Opening a document

| You see | What it means | What to do |
| --- | --- | --- |
| **No document here**, then "There is no document at this address. It may have been deleted, or the link has a typo." | No document has that address, or it exists and is not yours. edgy does not say which: a stranger gets the same answer as for a document that is not there. | Check the address. Ask the owner to share it with you. |
| **No longer shared with you**, then "You no longer have access to this document." | The owner took your access away while you had it open. | Choose **Back to your documents**. |
| `Opening…` that does not end | The server has not answered yet. | Wait; if it stays, see **The server did not answer** above. |
| "This document is archived: it is out of your list, and nothing in it is lost." with **Restore** | The document is in the archive. It still opens. | Choose **Restore** to bring it back to the list. |
| "This document is gone." in a deck's slide | A document in the deck was deleted. | Remove it from the deck. |

## The editor: saving

The header shows where your changes stand, for anyone who can edit.

| You see | What it means | What to do |
| --- | --- | --- |
| **Saved** | Every change has reached the server. | Nothing. |
| **Saving…** | Changes are on their way. | Nothing; it ends in a moment. |
| **Offline, will retry** | The server did not answer. Your changes wait in this tab and are sent again every second and a half, in order, until the server answers. | Start the server if it stopped. Keep the tab open: changes still waiting are held only in the open tab, so closing it loses them. |
| "You can view this document, not change it. What you type here stays in this tab." | You are a viewer. You can use inputs and buttons, and nothing is saved. | Ask the owner for edit access. See [Sharing](/people/sharing/). |

## The editor: messages that pop up

A short message appears at the bottom of the screen and goes away by itself.

| You see | What it means | What to do |
| --- | --- | --- |
| `That change was not saved. …` followed by a reason | The server refused a change. The change is dropped and the document is rebuilt from the server's version plus your other waiting changes. Typical reasons: `You can view this document, not change it.` (you are a viewer), `A page on another site can not change edgy.` (see below), or another person's change got there first and yours no longer fits, such as `No cell called "…".` | Read the reason. If another person changed the same cell, look at the document and do it again. |
| `Those cells are not next to each other.` or `Those cells don't form a rectangle.` | **Merge** only joins cells that sit together and make one block. Nothing changed. | Select cells that touch and form a rectangle. |
| `Merge needs at least two cells.` | Only one cell was selected. | Select more. |
| `Cells in different tabs can't be merged; move them into one first.` (or `…in different sections…`) | A merge cannot cross from one tab or section into another. | Move the cells into the same one, then merge. |
| `Another cell is already named "…".` | Names are unique in a document. | Choose another name. |
| `"…" is not a usable name: start with a letter, then letters, digits, - or _.` | The name has a space, a symbol, or starts with a digit. | Rename it. See [Names and references](/language/names/). |
| `"…" is reserved.` | `true`, `false`, `nil`, `null`, `it`, `i` and `acc` mean something in the language. | Choose another name. |
| `"…" is the id of another cell.` | The name is the same as the hidden id (`c2`) of another cell. | Choose another name. |
| `Another tab is already called “…”.` or `Another section is already called “…”.` | Titles of tabs and sections in one container must differ, because the container's value is the title. | Choose another title. |
| `There is already a column called “…”.` | A table's columns have unique names. | Choose another. |
| `Only pictures can be dropped onto a cell.` | You dropped a file that is not an image. | Drop a picture. |
| `pictures can be PNG, JPEG, GIF, WebP, AVIF or SVG` | The picture is in another format. | Convert it. |
| `that picture is larger than 8 MB` | The upload is too big. | Use a smaller file. |
| `The picture could not be uploaded.` | The upload failed and the server gave no reason. | Check the server is running, then try again. |
| `This cell holds no code yet. Press / to make it a formula.` | You pressed ⌘E on a cell that has no code, such as an empty cell. | Press `/` and choose **Formula**, or select a cell that holds code. |
| `Nothing handles … here yet.` | You tried an event in the studio that no handler is attached to. | Write a handler for it first. See [Events](/events/). |
| `No fetch cell "…".` | You asked a fetch cell to fetch now and the document no longer has one by that name. | Check the name. How a fetch that runs can fail is under **Fetch cells and timers** below. |

If you see `A page on another site can not change edgy.`, a write came from an address edgy does not recognise as its own. edgy accepts changes from its own address and, in development, from the address in `EDGY_WEB_URL` (`http://localhost:5173` unless you set it). Open the app at that address, or set `EDGY_WEB_URL` to the one you use.

## Cells showing errors

A cell that cannot work out its value shows the reason in red where its value would be, and the reason is also in the cell's tooltip and under **Value** in **Cell details**. A text cell with a broken [text template](term:text-template) shows its own text in red instead, with the reason in the tooltip. Other cells go on working.

```sx
(/ 1 0)
⇒ error: division by zero
(foo 1)
⇒ error: unknown function foo
(+ 1 "a")
⇒ error: expected a number, got "a"
```

A cell that reads a broken cell shows that cell's name before the reason, so you can find where it started:

```notation id=broken
["col",
  ["input", {"name": "qty", "type": "number", "value": 0}],
  ["formula", {"name": "each"}, ["/", 10, "$qty"]],
  ["formula", {"name": "total"}, ["*", "$each", 3]],
  ["formula", {"name": "a"}, ["+", "$b", 1]],
  ["formula", {"name": "b"}, ["+", "$a", 1]]]
```

```sx in=broken
total
⇒ error: each: division by zero
a
⇒ error: circular reference: a → b → a
```

`total` reads `each`, which divides by `qty`, which is 0. `a` and `b` read each other.

| You see | What it means | What to do |
| --- | --- | --- |
| `no cell called "…"` | A name in the expression is not a cell. It was misspelt, or the cell was renamed or deleted. | Fix the name. Names are exact: `Total` is not `total`. |
| `unknown function …` | The first word of a list is not a function and not a cell that holds one. | Check the spelling in the [function list](/language/functions/). To write a list of values, use `(list …)`. |
| `a list must start with a function; use (list …) for plain data, got …` | The expression starts with a value, as in `(1 2)`. | Write `(list 1 2)`. |
| `expected a number, got …` | A calculation got something that is not a number, such as the text "a" or a list. Empty cells count as 0, and text that looks like a number, such as "12", is accepted. | Check what the cell holds. |
| `division by zero` | A divisor is 0, often an input still at 0. | Guard it: `(if (= qty 0) 0 (/ total qty))`. |
| `circular reference: a → b → a` | Cells read each other in a ring, so none can be worked out first. | Break the ring: make one of them an [input](kind:input) or a [data](kind:data) cell that a button sets. |
| `… only works in an action, such as a button` | `set!`, `insert!` and the other actions were written where a value is expected. | Move it into a button's **What it does** or a handler. See [Events and actions](/events/). |
| `this takes too long to compute` or `this nests too deeply` | The expression loops or builds a list too large to finish. | Shorten the list or the recursion. |
| `missing )` or `missing }` | A bracket was opened and not closed. | Close it. The code editor underlines the place. |
| `unexpected )` or `unexpected }` | A closing bracket has nothing to close. | Remove it. |
| `a "string" is missing its closing quote` | A text value starts with `"` and never ends. | Add the closing quote. |
| `the expression ends too early` | The code stops in the middle of a form. | Finish it. |
| `expected one expression; wrap several in (do …)` | A field holds one expression and you wrote two. | Put them in `(do first second)`. |
| `{ } needs pairs: {key value key value}` | A record has a key with no value. | Add the value. |

The messages of the language are explained in depth in [Errors](/language/errors/). To see the cells that read a broken one, turn on **Show links between cells**.

## Buttons and handlers that fail

| You see | What it means | What to do |
| --- | --- | --- |
| A faded button; its tooltip says `This button does nothing yet` | **What it does** is empty. | Write the action. See [Button](/cells/button/). |
| Nothing happens when you press a button in **Edit** | In **Edit**, pressing a button selects it. | Switch to **Live**. |
| `That button failed: …` | The action stopped with an error, and none of its changes were made. The reason follows, for instance `no cell called "total".` | Fix the action. Most reasons are the ones in **Cells showing errors**; the rest are in this table. |
| `change: …` or `click: …`, then a sentence | A handler failed. The word before the colon is the event. | Open the cell's **Events** section and fix the handler. See [Events and actions](/events/). |
| `change: Stopped: events went 8 deep (…); a handler is probably setting off itself.` | A handler changed something that raised an event that ran the handler again, eight levels deep. The chain was stopped and what had run was kept. | Look at the cells named in the chain. A handler on `change` that sets its own cell always loops. See [Loops and undo](/events/loops-and-undo/). |
| `change: Stopped after 64 handlers ran for one event.` | One event set off too many handlers. | Cut what one change sets off. |
| `insert! needs a record: (insert! "orders" {qty qty})` | The second argument is not a record. | Write it between braces: `{key value}`. |
| `update! needs the id of a record: (update! "orders" (get row "id") {status "paid"})` | The record to change was not named. | Give its id, as in the message. |
| `update! needs the fields to change: …` | The third argument is not a record. | Give the fields in braces. |
| `emit! needs the name of an event: (emit! "saved" {total total})` | The first argument is not a valid event name. | Start with a letter; then letters, digits, `-` or `_`. |
| `start! needs a timer, and "…" is not one` (also `stop!`) | The name is not a [timer](kind:timer). | Name a timer cell. |
| `refresh! needs a fetch cell, and "…" is not one` | The name is not a [fetch](kind:fetch) cell. | Name a fetch cell. |
| `Collection names use letters, digits, - and _.` | A record was saved into a collection whose name has other characters. | Rename the collection in the action. See [Collections](/data/collections/). |
| `This document does not reach the collection "…".` | You are using someone else's shared document, and its owner has not let it use that collection. | Ask the owner to open and change the document. |
| `You can view this document, not change it, so nothing is saved.` | A viewer pressed a button that saves a record. The rest of the button still ran in their tab. | Ask for edit access. |
| `This link can only view the document, so nothing is saved.` | The same, through a view [share link](term:share-link). | Ask for an edit link. |

## Fetch cells and timers

A [fetch](kind:fetch) cell shows `Loading …`, then either when it was updated or `Couldn’t load …: ` followed by one of these reasons, with a **Retry** button. In **Edit** it is a small chip that says `failed`, with the reason in its tooltip. See [Fetch](/events/fetch/).

| The reason | What it means | What to do |
| --- | --- | --- |
| `the fetch has no address` | The cell has no URL. | Give it one. |
| `"…" is not an address` or `only http and https addresses can be fetched` | The address is malformed or uses another scheme. | Write a full `https://…` address. |
| `a path on this server can be /api/data/<collection> or /api/demo/…` | A path that starts with `/` may only read a collection of this server. | Use a full address, or `/api/data/<collection>`. |
| `the address … could not be found` | The name does not resolve. | Check the spelling and that the server has a network. |
| `… is a private or local address, which fetch cells may not reach` | The fetch runs on the server, which refuses addresses inside its own network. | Use a public address. |
| `the address could not be reached (…)` | The connection failed; the code in brackets says how. | Check the address is up. |
| `no answer within 10 s` | The address was too slow. | Try again, or use a faster source. |
| `the server answered 404` (or another number), sometimes followed by its message | The other side said no. | Open the address yourself to see why. |
| `the answer is larger than 1024 KB` | The answer is over the limit of 1 MB. | Fetch less. |
| `the answer is not JSON` | A fetch cell reads JSON only. | Point it at a JSON address. |
| `too many redirects` or `a redirect left http and https` | The address sends you in circles, or to another kind of address. | Use the final address. |
| `the secret … is not set on this server (EDGY_SECRET_…)` | A header names a secret (`secret:NAME`) that the server does not have. | Set `EDGY_SECRET_NAME` in the server's environment and restart. |
| `the secret … goes only where the server's owner sent it from this cell; ask them to open and change the document` | A secret is sent only to the address its owner chose for this cell. The address was changed by someone else. | Ask the owner to set the address again. |

A timer or a fetch cell works on the server, and only while someone has the document open in **Live**. In **Edit**, or with nobody in the document, a timer does not tick and a fetch does not refresh by itself. Open the document in **Live**. See [Timers](/events/timers/).

## Code fields and Ask AI

Every place that takes an expression is a code editor. It underlines a mistake as you type; the messages are the ones in **Cells showing errors**. Press ⌘E to open the [code studio](/editor/code-studio/).

**Ask AI** turns a sentence into code, checked against the document before you see it. See [Ask AI](/editor/ask-ai/).

| You see | What it means | What to do |
| --- | --- | --- |
| `I could not turn that into code. Try one of these phrasings.` | The built-in composer did not understand, and no other provider answered. Examples of phrasings come with it. | Use one of them, or write the code yourself. |
| `… The built-in composer did not understand that either.` | Claude or an agent was tried first and failed; the sentence before says why. | Read the reason, then rephrase. |
| `Claude is not set up on this server (no ANTHROPIC_API_KEY), so the built-in composer answered.` | You asked for Claude, but the server has no `ANTHROPIC_API_KEY`. The built-in composer did the work. | Set the key and restart, or accept the built-in answer. |
| `Claude could not answer: ….` | The call to Claude failed. | Read the reason; the built-in composer is tried next. |
| `No agent is listening on this document, so the built-in composer answered.` | You asked for an agent and none is waiting with `edgy_listen`. | Start your agent, or accept the built-in answer. |
| `Fell back to the built-in composer because no agent answered.` | An agent was listening but did not reply in time. | Try again. |
| `Asking AI isn’t available on this server yet.` | The server answered 404: it does not know the route for **Ask AI**, or the document is gone. | Restart the server from the current code, and check the document is still there. |
| `The server could not answer just now. Try again in a moment.` | The request failed on the server. | Try again; look at the terminal. |

## Sharing

| You see | What it means | What to do |
| --- | --- | --- |
| **No longer shared**, then "The person who shared this document has turned the link off. Ask them for a new one if you still need it." | The owner turned this link off. | Ask for a new link. |
| **This link doesn't open anything**, then "The document may have been deleted, or the link was copied only in part." | No link has this address. | Copy the whole link, including the end of it. |
| **View only**, with "You can try the inputs and buttons; nothing you change here is saved." | A view link. Your changes stay in your tab. | Ask for an edit link to change the document. |
| `There is no account with that email on this server. Ask them to sign up first.` | You can only give access to a person who has an account. | Ask them to sign up, then try again. |
| `You own this document already.` | You typed your own email. | Use the other person's. |
| `only its owner can do that` | Sharing, deleting and changing roles belong to the owner. | Ask the owner. |
| `the owner can not leave their own document` | The owner stays on the document. | To be rid of it, delete the document. |

See [Sharing with people](/people/sharing/) and [Share links](/library/share-links/).

## The library

| You see | What it means | What to do |
| --- | --- | --- |
| `The library could not be loaded.` | The server did not answer. | See **The server did not answer** above. |
| `Could not create the document.` | A new document could not be made. | Try again; look at the terminal. |
| `The description was not saved.` or `That did not save.` | The server refused the change and gave no reason. | Try again. |
| `The deck could not be made.` | Grouping failed. | Try again. |
| `an archived document can not be pinned; restore it first` | Pins are for documents in the list. | **Restore** it, then pin. |
| `only its owner can pin or archive it` | A document someone shared with you is theirs to pin or archive. | Ask the owner. |
| `That did not work.` | Any other library action that failed. | Try again. |

## Export

Export is a download link, so a failure shows as the answer in the browser instead of a file. See [Export](/library/export/).

| You see | What it means | What to do |
| --- | --- | --- |
| No **Export as HTML** button | Only a document's owner can export it. | Ask the owner. |
| `{"error":"the offline build is missing; run npm run build"}` as the page | The server has no offline bundle (`dist/offline`). | Run `npm run build`, then restart. In development the server makes the bundle on the first export, which takes a while; if making it fails you get `something went wrong on the server` and the reason is in the terminal. |
| `only its owner can do that` | You are not the owner. | Ask the owner. |
| A picture is missing in the file | The server could not read it when exporting; pictures it cannot read are left out. A picture linked from another address is checked like a fetch cell is, so an address the server cannot reach, or a private one, is left out. | Upload the picture into the cell instead of linking it. |
| **Offline copy**, with "Nothing you change here is saved anywhere; closing the page forgets it." | This is how an exported file behaves: it works with no server and keeps nothing. | Not a fault. Open the original to keep changes. |
| `not in this offline copy` | Something in the file asked for a document or a collection that the export did not include. | Export again from the document that holds it. |

## The sync badge

The badge in the top bar says whether this machine's changes have reached the cloud. Click it to sync now. See [Sync](/people/sync/).

| The badge | What it means | What to do |
| --- | --- | --- |
| **Sync off** | "Sync is off: documents stay on this machine. Set TURSO_URL and TURSO_AUTH_TOKEN to sync them." Both variables must be set. | Put them in `.env` and start with `npm run dev:sync`. |
| **Synced** | "Every change here is in the cloud. Click to sync now." | Nothing. |
| **Syncing** | "1 change on the way to the cloud." (or "… changes"), or "Syncing with the cloud." | Wait. |
| **Offline** | "The cloud can't be reached; … changes wait here and go when it answers. Click to try now." The cloud did not answer, or answered with a server error. Your documents are safe on this machine. | Check the network, then click the badge. |
| **Sync stopped** | "The cloud refused something: …. Changes stay here. Click to try again." The reason follows. | Read the reason below. After an error the server waits at least 30 seconds before trying again by itself; clicking the badge tries now. |

Reasons that follow **Sync stopped**:

| The reason | What to do |
| --- | --- |
| `the cloud refused the credentials (HTTP 401); check TURSO_AUTH_TOKEN` (also 403) | The token is wrong or expired. Fix `TURSO_AUTH_TOKEN` and restart. |
| `the cloud refused a request that large (HTTP 413)` | The cloud refused one request as too large. Look at the `sync:` line in the terminal. |
| `the cloud refused a statement: …` | The cloud's own message follows. Read it. |

The server's terminal also prints lines that start with `sync:`, for instance `sync: skipped … (seq …): …` for a change that could not be replayed, and `sync: the picture … was not sent: …`. They name what was left out and why.

## Agents and MCP

An agent reaches edgy through [MCP](/agents/mcp/) or the [HTTP API](/agents/http/). In local mode, agents on this machine need no key; in accounts mode, or from another machine, they send an [API key](/people/api-keys/).

What an MCP tool answers when it fails:

| The tool says | What it means | What to do |
| --- | --- | --- |
| `Edgy is not running at …. Start it with "npm run dev" in the edgy folder, then try again.` | Nothing answers at `EDGY_URL`. | Start edgy, or correct `EDGY_URL`. |
| `Edgy needs an API key: sign in to edgy, open Profile → API keys, create one, and set EDGY_API_KEY next to EDGY_URL in the MCP server's settings.` | The server asked for a sign-in and no key is set. | Make a key and set `EDGY_API_KEY` in `.mcp.json` or your client's settings. |
| `Edgy refused the API key in EDGY_API_KEY: this API key is not valid; make one in your profile (Profile → API keys).` | The key is mistyped, or from another server (keys belong to the server that made them). | Make a key on this server. |
| `Edgy refused the API key in EDGY_API_KEY: this API key was revoked; make a new one in your profile.` | The key was revoked. | Make a new key. |
| `Edgy refused the API key in EDGY_API_KEY: this API key belongs to an account that no longer exists.` | The account was deleted. | Make a new key under another account. |
| `no document "…". Known: …` | The id or title matches nothing the key's person can reach. The message lists what does. | Use an id from the list. |
| `several documents are titled "…"; use an id: …` | The title is not unique. | Use one of the ids in the message. |
| `no deck "…". Known: …` | The same, for decks. | Use a deck id. |
| `give either doc or deck` | `edgy_export` needs exactly one of them. | Pass one. |
| `name the collection` | `edgy_data` needs `collection` for this action. | Pass it. |
| `Error: …` from `edgy_eval` | The expression failed against the document. Nothing changed. | Fix the expression. |
| A reason such as `no cell called "x"` from `edgy_apply` | One op did not apply, so none did: ops go in together or not at all. | Fix that op, and send them again. |
| `Request … is no longer waiting: it was answered or timed out.` | `edgy_answer` came too late. | Call `edgy_listen` for a new request. |
| `The code was rejected: …. Fix it and call edgy_answer again for ….` | The code failed its check against the document. | Fix it and answer the same request again. |

`Nothing yet.` from `edgy_listen` is not an error: nobody wrote to the document before the timeout.

What the HTTP API answers, as `{"error": "…"}`:

| Status and message | What it means |
| --- | --- |
| 401 `sign in first` | No credential. Send `Authorization: Bearer edgy_…`, or a session cookie. |
| 401 `this API key is not valid; make one in your profile (Profile → API keys)`, `this API key was revoked; make a new one in your profile`, or `this API key belongs to an account that no longer exists` | As above. |
| 403 `an API key can not do that; sign in in the browser` | The profile, the password and the keys themselves need the person, not an agent with their key. |
| 403 `you can view this document, not change it` or `only its owner can do that` | The person's role on the document is too low. |
| 403 `a page on another site can not change edgy` | A browser write from an address that is not edgy's own. Agents with a key are not affected. |
| 404 `no such document` | No document has that id, or the person has no access to it. |
| 404 `this link does not open anything`, 410 `this document is no longer shared`, 403 `this link does not reach that` or `this link can view the document, not change it` | A [share link](term:share-link) that is unknown, turned off, or too narrow for the route. |
| 422 with the reason, such as `no cell called "x"` | An op or an expression failed. See [Ops](/agents/ops/). |
| 400 `send {"ops": [[verb, …], …]}` | The body of a call to `/api/docs/:id/ops` is not a list of ops. |
| 400 `the request body is not valid JSON` | The body could not be read. |
| 500 `something went wrong on the server` | A fault in the server. The details are printed in its terminal. |

## Still stuck

- Reload the page. The document is kept by the server, and the page rebuilds from it.
- Read the terminal where edgy runs: errors the page cannot show are printed there.
- Look at **Activity** to see what changed, who changed it and what failed. See [Activity](/editor/activity/).
- Look up a word in the [glossary](/glossary/), or find a page in the [A–Z](/a-z/).
