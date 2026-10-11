---
title: Share links
---

A share link opens one document in Live for anyone who has the address, with no account; this page covers the two kinds of link, what the person on the other end sees, and how to turn a link off.

::shot share-dialog "The Share dialog. People with access are listed first; below them, a Can view link and a Can edit link, each on or off."

To give a person with an account a lasting place in a document, with a role, use [Sharing with people](/people/sharing/) instead. A link is for everyone else: a client, a class, a colleague without an account.

## Making a link

Only the owner makes links. Open the **Share** dialog from the document's header (**Share**, or **Share…** in the **More** menu on a phone), or from **Share…** in the document's card menu in the [library](/library/). There are two rows:

| Row | A person with the link can |
| --- | --- |
| **Can view** | Try the inputs and buttons. Nothing they do is saved. |
| **Can edit** | Change the document; what they change is saved and shows up for you as it happens. |

Choose **Make a link** on a row. The address appears with a **Copy** button (if your browser won't copy, the address is selected for you to copy by hand). Send it to anyone. Both links can be on at once, and each is a different address.

The dialog also says: *edgy runs on this computer, so a link opens for others once edgy is hosted where they can reach it.* A link made on your own machine points at your own machine, which only you can open. Set `EDGY_WEB_URL` to the address people reach edgy at, and links are made with it.

A link looks like `https://edgy.example.test/s/` followed by 43 random characters. The characters are the key: whoever has them has the link, so share it as carefully as the document.

## What the person sees

Opening the link shows the document in [Live](term:view) and nothing else:

- No editor, no [Cell details](term:cell-details), no way to Edit or Page view.
- No library, no other documents of yours, no Data page. The link reaches that one document and nothing more.
- A header with the document's title, a badge, and a theme button. The badge says **View only** or **Can edit**. On a view link a note under the header says: *You can try the inputs and buttons; nothing you change here is saved.*
- If the connection drops: **Offline, will retry**.

Inputs, buttons, [handlers](term:handler) and formulas all work. On a view link, what a person types stays in their own tab: they see their typing, nobody else does, and a reload forgets it. If a button tries to save a record or fetch again, they get a toast, **This link can only view the document, so nothing is saved.**

On an edit link their changes are real changes. They land in the document's history, in [Activity](/editor/activity/), under the name **Guest**, and you see them as they happen. Guests are not listed among the people in the document, and they don't get the Activity panel or the messages to an agent.

### Records and fetch cells

The document's cells read [collections](term:collection) of yours. A link reaches the collections the document used when you last changed it, and no others: a cell reading something else shows an error until you change the document. A view link reads those records; an edit link also saves records into them and can fetch again.

A [fetch](kind:fetch) cell shows its answer to a guest but never its address or headers; an address can hold a key. See [Fetch](/events/fetch/).

## Turning a link off

Choose **Turn off** on its row. It takes effect at once, for good:

- A person with the page open sees **No longer shared**: *The person who shared this document has turned the link off.* Their stream closes.
- Anyone who opens the address later sees the same page.
- Turning the link on again makes a new link with a new address. The old address stays dead.

The other link is not affected. A link that never existed, or whose document was deleted, says **This link doesn't open anything**. Deleting the document also ends all its links.

## What the server answers

A guest is a different kind of visitor from a signed-in person: every route says what it needs, and a link reaches only a few.

| Request | Answer |
| --- | --- |
| Read the document, its values and records, its stream | Allowed with either link |
| Change it, save records, fetch again | Allowed with an edit link; a view link gets 403, “this link can view the document, not change it” |
| Anything else (the library, another document, a deck, a profile) | 403, “this link does not reach that” |
| A link that was turned off | 410, “this document is no longer shared” |
| A link nobody made | 404, “this link does not open anything” |

A script sends the token in the `x-edgy-share` header, or as `?share=` where a header can't be sent (an event stream). The page itself asks [GET /api/shared](route:GET /api/shared) what the link opens and what it may do.

## For agents and scripts

The [edgy_share](tool:edgy_share) tool turns a link on or off and lists the links that are on. Over HTTP:

| Route | For |
| --- | --- |
| [GET /api/docs/:id/shares](route:GET /api/docs/:id/shares) | The links that are on, with their addresses |
| [POST /api/docs/:id/shares](route:POST /api/docs/:id/shares) | Turn one on: `{"access": "view"}` or `"edit"`. If it is on already, you get that one back. |
| [DELETE /api/shares/:token](route:DELETE /api/shares/:token) | Turn one off |

## Under the hood

The dialog is [ShareDialog.tsx](src:src/web/share/ShareDialog.tsx) and the page a link opens is [SharedPage.tsx](src:src/web/share/SharedPage.tsx). Who a guest is and what a link reaches are decided in [access.ts](src:src/server/access.ts); links are kept in the `shares` table of [store.ts](src:src/server/store.ts). The [access model](/people/sharing/) page draws all the roles together.
