---
title: Presence
---

Presence shows who else has a document open right now and which cell each of them has selected, as faces in the header, coloured outlines on the cells, and names in Activity.

::shot presence "Two people in one document. Ben's face is in the header, and a cell in his colour has his name on its corner."

Presence needs more than one account. Alone in a document, or in [local mode](/people/accounts/#local-mode-and-accounts-mode) with nobody else, you see nothing extra. When a second person opens the same document, it starts.

## Faces in the header

Beside the title, each other person who has the document open appears as an avatar: their initials on their [colour](/people/accounts/#the-profile). There is one face per person, however many tabs they have open.

- On a desk, up to four faces show; on a phone, two. More are counted as **+3**, and pointing at the count names them.
- Point at a face for what the person is doing: **Ben — editing (total)** or **Ben — reading**. *Editing* means they are in **Edit** in at least one tab; *reading* means **Live** or **Page**. The name in brackets is the cell they have selected, by its name or, if it has none, its id.
- Click a face to go to that person's cell. The document scrolls to it, and in **Edit** it is selected too.

You never see your own face, nor your other tabs. Agents are not faces, and neither are people who came in by a [share link](/library/share-links/): they appear nowhere in presence.

## Selected cells

When someone else is in **Edit** and selects a cell, that cell gets an outline in their colour, with their name on its top-left corner. When several people have the same cell selected, the outlines stack, each a little outside the last.

The outline moves a moment after they move. The cell is only marked; you can select it, change it and undo as usual. Presence is a map of attention, not a lock: two people can change the same cell, and the later change wins, as it does anywhere in edgy. When the people are on different machines, [sync](/people/sync/) says how conflicts resolve.

When a person switches to **Live** or **Page** their selection is cleared, so their outline goes. Their face stays.

## Names in Activity

At the top of [Activity](/editor/activity/), a row shows who is here: **You**, then each other person with their avatar and name, and any agent that was active in the last ten minutes. Pointing at a person gives the same sentence as the header face.

Under it, every change carries a name:

| Who made it | Activity says |
| --- | --- |
| A person | Their name as it is **now**: rename yourself in your profile and old changes show the new name. Your own say **You**. |
| An agent with a person's API key | The agent and the person: **Claude for Ana**. See [API keys](/people/api-keys/). |
| A visitor with an edit link | **Guest** |

## Who sees you

The owner, editors and viewers of a document all appear to each other, because they can all open it. Your name and avatar colour come from your [profile](/people/accounts/#the-profile); what the others see of you is your name, colour, whether you are editing or reading, and the cell you have selected. Nobody outside the document sees you.

## How it works

Each open tab keeps a live connection to the server, and tells it when you switch between **Edit**, **Live** and **Page**, and when your selection settles (after about 150 milliseconds, so dragging across cells doesn't flood it). The server keeps who is connected, one entry per person, and sends everyone the list whenever it changes. Closing the tab, losing the connection or losing access removes you. A viewer is always counted as reading.

| Route | For |
| --- | --- |
| [GET /api/docs/:id/people](route:GET /api/docs/:id/people) | The accounts with access, and in `present` who is here now |
| [POST /api/docs/:id/viewer](route:POST /api/docs/:id/viewer) | A tab says its view and its selected cell |
| [GET /api/docs/:id/events](route:GET /api/docs/:id/events) | The live stream, whose `people` event carries the list |

The header faces are in [Editor.tsx](src:src/web/editor/Editor.tsx), the outlines in [Overlay.tsx](src:src/web/editor/Overlay.tsx), and the naming rules in [people.ts](src:src/web/editor/people.ts).
