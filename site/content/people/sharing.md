---
title: Sharing with people
---

You can give other people with an account a place in a document, as an editor who changes it or a viewer who reads it; this page covers the three roles, adding, changing and removing people, leaving, and what each role is answered when it asks for too much.

::shot share-dialog "The Share dialog. The People section lists the owner first, then everyone who was given access, each with a role."

Every document has an **owner**: the account that made it. The owner decides who else may open it, and each person gets one role.

## The three roles

| | Owner | Editor | Viewer |
| --- | --- | --- | --- |
| Open and use it in Live, see it as Page | Yes | Yes | Yes |
| Edit view: change cells, undo | Yes | Yes | No |
| Read Activity and its history | Yes | Yes | Yes |
| Rename it, change its description | Yes | Yes | No |
| Save records through it, fetch again, message an agent, Ask AI | Yes | Yes | No |
| See where fetch cells fetch from | Yes | Yes | No: only their answers |
| Pin, archive, delete, put in a deck | Yes | No | No |
| Export as HTML | Yes | No | No |
| Make share links, add and remove people | Yes | No | No |
| Leave | No | Yes | Yes |

A viewer sees a **Can view** badge in the header and has only **Live** and **Page**. A note says *You can view this document, not change it. What you type here stays in this tab.* They can try the inputs and press buttons; nothing is sent to the server, as with a [view link](/library/share-links/).

The owner's pins, archive and decks arrange the owner's own library. You can't pin or archive someone else's document; it sits in your **Shared with me** list as it is.

## Adding someone

You add people by the email of their account. edgy sends no message: the document appears in their [library](/library/) under **Shared with me**.

1. Open the document and choose **Share** in the header (**Share…** in the **More** menu on a phone), or **Share…** in its card's menu in the library.
2. In **People**, under **Add people**, type **Email of their account**.
3. Choose **Can edit** or **Can view** and press **Add**.

The list shows the owner first (**Owner**), then everyone else with their name and email. Adding an email that is already on the list changes that person's role.

Two answers you may meet: *There is no account with that email on this server. Ask them to sign up first.* and *You own this document already.* Nothing is sent to an address that has no account, so the person has to [sign up](/people/accounts/) first.

## Changing and removing

In the same list, each person other than the owner has a menu for their role (**Can view** or **Can edit**) and a **Remove** button. Both take effect at once, even for people who have the document open:

- Someone removed sees **No longer shared with you**: *You no longer have access to this document.* with a button back to their library.
- Someone whose role changes gets the new role without reloading.

## Leaving

A viewer or an editor can leave. Open the dialog (**Share** in the header, or **People…** in the **More** menu) and choose **Leave this document**, or choose **Leave** in the document's card menu under **Shared with me**. The document leaves your list and you can no longer open it; its owner can add you again. The owner can't leave their own document: *the owner can not leave their own document*.

## Shared with me

The second button above the library's search lists what others gave you, newest first, with the owner's name and your role on each card. It is described on the [Library](/library/#mine-and-shared-with-me) page.

## Who gets which answer

::diagram access-model

Each request is first sorted into who is asking: a person (by session, or by an API key), a guest (by a share link) or nobody. Then each route declares what it needs, and the answer depends on both.

| Asking | Answer |
| --- | --- |
| Nobody signed in | 401, *sign in first* |
| A stranger, for a document | **404**, *no such document*: edgy doesn't tell a stranger the document exists |
| A viewer, for something an editor can do | **403**, *you can view this document, not change it* |
| A viewer or an editor, for something only the owner can do | **403**, *only its owner can do that* |
| Anyone but the owner, for a deck | 404, *no such deck* |
| An agent with a key, for something only a person can do (the profile, keys, password) | 403, *an API key can not do that; sign in in the browser* |

The split matters for what you reveal: a 404 means “nothing here for you”, a 403 means “you are in, and may not do this”. A role that is too low is told what it can do.

## Collections belong to the owner

A [collection](term:collection) belongs to an account. Two people can each have an `orders` collection and never see each other's.

A document reads and writes its **owner's** collections, whoever is looking. So when Ben edits Ana's shared order form, the table in it shows Ana's `orders` and the button saves into Ana's `orders`. A formula `(rows "orders")` in Ben's own document reads Ben's.

What a document may reach is fixed by its owner: the collections it used at the owner's last change, and when the owner first let someone in. An editor who adds `(rows "salaries")` to Ana's document does not reach Ana's `salaries`: the cell shows an error, *this document does not reach the collection “salaries”; its owner's next change to it lets it*, until Ana changes the document. Viewers read records only through a document that reaches them. The [Data page](/data/data-page/) lists only the collections of the account you are signed in as.

## For agents and scripts

| Route | For |
| --- | --- |
| [GET /api/docs/:id/people](route:GET /api/docs/:id/people) | Who has access, who is here now, and your role |
| [POST /api/docs/:id/people](route:POST /api/docs/:id/people) | Add by email, or change a role: `{"email": "ben@example.test", "role": "editor"}` |
| [PATCH /api/docs/:id/people/:user](route:PATCH /api/docs/:id/people/:user) | Change someone's role |
| [DELETE /api/docs/:id/people/:user](route:DELETE /api/docs/:id/people/:user) | Remove someone, or leave (your own id) |

An agent with your API key can do what you can. See [API keys](/people/api-keys/).

## Under the hood

The one place that decides is [access.ts](src:src/server/access.ts); the dialog is [ShareDialog.tsx](src:src/web/share/ShareDialog.tsx). The longer story, with the route table, is on [how access works](/internals/access/).
