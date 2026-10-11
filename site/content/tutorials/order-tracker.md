---
title: Saving and tracking orders
nav: Order tracker
---

You build a form that saves each order as a record, a table that shows the saved orders, and a button on every row that marks an order shipped, and learn how records outlive a document. It takes about twenty minutes. Read [A form in steps](/tutorials/wizard/) first, because the button here is built the same way.

You will use [input](kind:input), [formula](kind:formula), [button](kind:button) and [table](kind:table) cells, the actions [insert!](fn:insert!) and [update!](fn:update!), the function [rows](fn:rows), and the **Data** page.

A [record](term:record) is one entry in a [collection](term:collection). A collection belongs to your account, not to the document: a button saves to it with `insert!`, and any of your documents reads it with `rows`.

## Start the document

1. On the home page, press **New document**. Click the title at the top, select all (⌘A, or Ctrl+A), type `Order tracker` and press Enter.
2. With no cell selected, set **Currency** in the **Page** section of **Cell details** to `EUR` and press Enter.
3. Click the empty cell and type `# Orders`. Press Esc.

## The form

4. Press [⌥↓](key:split) (Alt+↓ elsewhere), then `/`, type `Text field` and press Enter. Set **Name** to `customer` and **Label** to `Customer`.
5. Press ⌥→ (Alt+→), then `/` **Number**. Set **Name** to `qty`, **Label** to `Quantity` and **Value** to `1`.
6. Press ⌥→, then `/` **Formula**. Type the expression below and press Enter. Set **Show the result as** to **Currency**, then **Name** to `total`.

```sx
(* qty 24)
```

A mug costs 24 euros; the total is the price times the quantity.

7. Press Esc to select the row, then ⌥↓. Press `/` **Button**. Set **Label** to `Save order`. In **What it does**, type the action below and press Enter.

```sx
(do (insert! "orders" {customer customer qty qty total total status "New"}) (set! customer ""))
```

`(insert! "orders" {...})` saves one record in the collection `orders`. In `{customer customer qty qty ...}` each field name is followed by the expression for its value: the field `customer` gets the value of the cell `customer`. The collection is made the first time something is saved to it. The second action empties the **Customer** field, ready for the next order.

## The table

8. Press ⌥↓, then `/` **Table**. The cell shows three sample rows. With the table selected, click the field in the formula bar above the sheet, type `(rows "orders")` and press Enter. The table empties: it now shows the records of `orders`, and there are none.

## Save two orders

9. Switch to **Live**. Type `Ada Lovelace` in **Customer** and press **Save order**. Then type `Grace Hopper`, set **Quantity** to `3` and press **Save order**. Two rows appear in the table, and **Customer** empties after each save.

## A button on every row

10. Switch back to **Edit** and click the table to select it. In **Cell details**, in the **Content** section, find **Columns** and untick the box beside **at** (its label for screen readers is **Show at**). That column is the time the record was saved; this table does not need it.
11. Under **Row buttons**, choose **Change a field**. Set **Field to change** to `status` and **New value** to `Shipped`. Press **Add the button**. A button called **Shipped** now sits at the end of every row.

The button's action is `(update! "orders" (get row "id") {status "Shipped"})`. In a row button, `row` is the record of the row that was pressed, and `(get row "id")` is its id; [update!](fn:update!) changes the fields you give and leaves the rest.

12. Switch to **Live** and press **Shipped** on Ada's row. Its status changes from *New* to *Shipped* in the table at once.

## See the records

13. Open the home page and choose **Data** in its header. Select `orders` in the list. Each record shows when it was saved and its fields; the trash icon deletes one, and **Delete all** empties the collection. See [the Data page](/data/data-page/).

The records are still there if you delete the document. Any other document of yours can read them with `(rows "orders")`: the next tutorial does.

## The finished document

::shot tutorial-order-tracker "The finished tracker in Live: the form, and the table with a Shipped button on each row."

Here it is, running with six sample orders. Records you save in this page stay in memory.

```live id=tracker template=tutorial-order-tracker height=460
```

You can open it as a template: the [Order tracker](template:tutorial-order-tracker) entry on [Templates](/library/templates/) has an **Open in edgy** button. Opening it also saves its six sample orders, but only when your `orders` collection is empty.

```sx in=tracker
(len (rows "orders"))
⇒ 6
(set! customer "Ada Lovelace")
(insert! "orders" {customer customer qty qty total total status "New"})
(len (rows "orders"))
⇒ 7
(update! "orders" "r1" {status "Shipped"})
(get (first (rows "orders")) "status")
⇒ "Shipped"
```

## What you learned

- [insert!](fn:insert!) saves a record, [update!](fn:update!) changes one and [rows](fn:rows) reads a collection. See [Collections](/data/collections/) and [Actions](/language/functions/actions/).
- A table whose rows come from a formula, `(rows "orders")`, follows the collection. See [table](kind:table).
- Row buttons act on the record of their row through `row`. See [Events and actions](/events/).
- The **Data** page shows every collection and lets you delete records. See [the Data page](/data/data-page/).
- A collection belongs to your account, so every document of yours reads the same records.

Next, turn the records into numbers and charts: [Dashboard](/tutorials/dashboard/).
