---
title: The Data page
nav: Data page
---

The Data page shows the records your documents have saved, collection by collection, and lets you delete them; this page covers what it shows, deleting records, and what it doesn't do.

::shot data "The Data page: collections on the left, the records of one as a table."

## Opening it

Choose **Data** in the top bar of the home page. The address is `/data`.

## What it shows

On the left, under **Data**, every [collection](/data/collections/) of the account you are signed in as, in alphabetical order, with how many records each holds. The first one is open; click another to see it.

On the right, the open collection's name, how many records it holds, and its records as a table:

- **Newest first.** The first column, **when**, says how long ago each record was saved.
- **One column per field.** Every field any record has gets a column, in the order they first appear. A record without a field leaves its cell empty. Numbers line up on the right.
- `id` and `at` are not shown.

With nothing saved yet the page says *No records yet. Try the feedback form template.* The [Feedback form](template:feedback) saves a record each time it is sent.

## Deleting

- The trash button at the end of a row (**Delete this record**) deletes that record at once.
- **Delete all** deletes every record in the open collection, after the browser asks *Delete every record in "orders"?*

A collection with no records left goes from the list. Deleting can't be undone, and every document that reads the collection follows at once: a table loses the row, a total goes down.

> [!WARNING]
> Records are not part of any document's history, so **Undo** in a document does not bring back a record deleted here.

## What it doesn't do

- **Make or change records.** Records are saved by buttons and handlers with [insert!](fn:insert!) and changed with [update!](fn:update!), or by an agent with [edgy_data](tool:edgy_data). To change a field by hand, give a table a row action that calls `update!`, as in [Saving and tracking orders](/tutorials/order-tracker/).
- **Follow changes.** The page loads the records when it opens. Open it again to see records saved since.
- **Show someone else's records.** The page lists only your own collections. A document someone shared with you reads its owner's collections, and those are on the owner's Data page, not yours. See [Who owns a collection](/data/collections/#who-owns-a-collection).

## Under the hood

The page is [DataPage.tsx](src:src/web/pages/DataPage.tsx). It reads [GET /api/data](route:GET /api/data) and [GET /api/data/:name](route:GET /api/data/:name), and deletes with [DELETE /api/data/:name/:id](route:DELETE /api/data/:name/:id) and [DELETE /api/data/:name](route:DELETE /api/data/:name).
