---
title: Collections
---

A collection is a named set of records that belongs to an account and outlives any one document; this page covers how records are saved and read, who owns them, what a document may reach, and what undo, export, sync and templates do with them.

```live id=notes title="Save a note, read it back" height=300
{"root": ["col",
    ["row", {"size": "hug"},
      ["input", {"name": "note", "type": "text", "value": "Call Northwind Studio", "label": "Note"}],
      ["button", {"icon": "save", "do": ["insert!", "notes", {"text": "$note", "done": false}]}, "Save"]],
    ["table", {"name": "saved", "label": "Saved notes", "columns": ["text", "done"],
               "actions": [{"label": "Delete", "do": ["delete!", "notes", ["get", "$row", "id"]]}]},
      ["rows", "notes"]],
    ["text", "Notes saved: {{(len (rows \"notes\"))}}"]],
  "data": {"notes": [{"text": "Send the quote to Ada", "done": true}]}}
```

Press **Save**: a record goes into `notes`, and the table and the count follow it without anything else being told. In your own document the record goes to the server and stays there when you close the document; this example keeps its records in memory.

## Records

A [record](term:record) is a set of named fields, such as `{text "Call Northwind Studio" done false}`. When it is saved, edgy gives it two more:

| Field | What it holds |
| --- | --- |
| `id` | A short random name, the same for as long as the record lives. Pass it to [update!](fn:update!) and [delete!](fn:delete!). |
| `at` | When it was saved, in milliseconds. |

A record can't choose its own `id` or `at`: fields with those names are left out when it is saved, and can't be changed later. Records come back oldest first.

## Saving and changing

Four [actions](/language/functions/actions/#saving-records) change a collection. Like every action they run in a [handler](term:handler) or a [button](kind:button), never in a formula.

| Action | Does |
| --- | --- |
| [insert!](fn:insert!) | Saves a new record: `(insert! "orders" {client client total total})` |
| [update!](fn:update!) | Sets some fields of a record by its `id`: `(update! "orders" (get row "id") {status "Paid"})` |
| [delete!](fn:delete!) | Deletes one record by its `id` |
| [clear!](fn:clear!) | Deletes every record in the collection |

There is nothing to set up first. The first record saved into a name makes the collection, and a collection with no records left is no longer listed.

A name uses letters, digits, `-` and `_`, up to 60 characters: `orders`, `studio-invoices`, `q3_leads`. Anything else fails with *Collection names use letters, digits, - and _.*

## Reading

| Where | How |
| --- | --- |
| Any formula | [rows](fn:rows) gives the records as a list: `(sum-by (get it "total") (rows "orders"))` |
| A [table](kind:table) | Set its rows to **Saved records** and pick a **Collection**, or give it the formula `(rows "orders")` |
| A [fetch](kind:fetch) cell | The address `/api/data/orders` |
| You | The [Data page](/data/data-page/) |

Every cell that reads a collection is worked out again when a record in it is saved, changed or deleted, by anyone, in any document that reads it. A record saved in one tab shows in the others at once.

A record saved by an action is added after the action finishes, so `rows` read later in the same action does not show it yet.

## Who owns a collection

A collection belongs to an account. Two people can each have an `orders` collection and never see each other's records. All the documents of one account read the same `orders`, which is how an order form in one document feeds a dashboard in another.

A document reads and writes its **owner's** collections, whoever has it open. When Ben edits a document that Ana shared with him, its table shows Ana's `orders`, and its button saves into Ana's `orders`. The same formula in a document of Ben's own reads Ben's.

## What a document may reach

The owner always reaches all of their collections. Anyone else, an editor, a viewer or someone with a [share link](/library/share-links/), reaches only the collections the document used at its owner's last change:

- A collection named in a formula, such as `(rows "orders")`, or in an action, such as `(insert! "orders" …)`.
- A fetch cell's `/api/data/<collection>` address.

So an editor can't add `(rows "salaries")` to Ana's document and read her `salaries`. The cell shows *this document does not reach the collection "salaries"; its owner's next change to it lets it*, until Ana changes the document herself.

| Who | Reads records | Saves records |
| --- | --- | --- |
| Owner | All of their collections | All of their collections |
| Editor, or an edit link | Those the document reaches | Those the document reaches |
| Viewer, or a view link | Those the document reaches | No |

A viewer can still press a button that saves: nothing is saved, and the document says so. See [Sharing with people](/people/sharing/#collections-belong-to-the-owner).

## Records and the document

A collection lives beside your documents, not inside one. That changes what some things do:

- **Undo.** Saving, changing and deleting records are not part of a document's history. [Undo](key:undo) takes back what a button did to cells, but a saved record stays. Remove it on the [Data page](/data/data-page/) or with `delete!`. See [Undo and history](/editor/undo/).
- **Deleting a document.** Its records stay: they belong to the collection, and other documents may read them.
- **Templates.** A template that comes with sample records saves them only into a collection of yours that is still empty, so opening it twice doesn't add them twice. See [Templates](/library/templates/).
- **Export.** An HTML export holds the records of the collections the document reads, as they are at that moment. A button in the file saves into the file's own copy, which is forgotten on reload. See [Export](/library/export/).
- **Sync.** Records go to the cloud with your documents and merge field by field. See [Sync](/people/sync/).
- **Deleting your account** deletes your collections. See [Accounts](/people/accounts/).

## Many people at once

A record is the safe way to count things many people do. A [set!](fn:set!) writes a value: if Ada and Grace both press a button that adds one to `count`, each browser works out the same new number and the count goes up by one. Saving a record for each press and counting with `(len (rows "presses"))` gives two. See [Who runs what](/events/who-runs-what/).

## For agents and scripts

| Route or tool | For |
| --- | --- |
| [GET /api/data](route:GET /api/data) | The collections, with how many records each holds |
| [GET /api/data/:name](route:GET /api/data/:name) | A collection's records |
| [POST /api/data/:name](route:POST /api/data/:name) | Save a record: `{"record": {"client": "Ada Lovelace", "total": 80}}` |
| [PATCH /api/data/:name/:id](route:PATCH /api/data/:name/:id) | Change fields of a record |
| [DELETE /api/data/:name/:id](route:DELETE /api/data/:name/:id) | Delete a record |
| [DELETE /api/data/:name](route:DELETE /api/data/:name) | Empty a collection |
| [edgy_data](tool:edgy_data) | All of the above, for an agent over MCP |

Without `?doc=` a route works on your own collections. With `?doc=<id>` it works through that document, with the reach above.

## Under the hood

Records are rows of the `records` table, keyed by owner and collection; see [Storage](/internals/storage/#records-and-collections). What a request may reach is decided in [access.ts](src:src/server/access.ts), and the collections a document uses are found by `collectionsUsed` in [events.ts](src:src/core/events.ts). The longer story is on [how access works](/internals/access/).
