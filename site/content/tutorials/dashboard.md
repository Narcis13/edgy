---
title: A dashboard from records
nav: Dashboard
---

You build a dashboard of three stats and two charts that read the orders saved in the [Order tracker](/tutorials/order-tracker/) tutorial, and learn how a stat compares a number and draws a trend and how a chart takes a list. It takes about twenty minutes.

You will use [stat](kind:stat) and [chart](kind:chart) cells and the functions [rows](fn:rows), [sum](fn:sum), [column](fn:column), [map](fn:map), [count-if](fn:count-if) and [group](fn:group).

## Have records to read

The dashboard reads the collection `orders`, with the fields `customer`, `qty`, `total` and `status`. If you built the order tracker you have some. If not, open the tracker as a template: the [Order tracker](template:tutorial-order-tracker) entry on [Templates](/library/templates/) has an **Open in edgy** button, and opening it saves six sample orders as long as your `orders` collection is empty. You can delete that document afterwards; the records stay.

## Start the document

1. On the home page, press **New document**. Click the title at the top, select all (⌘A, or Ctrl+A), type `Orders dashboard` and press Enter.
2. With no cell selected, set **Currency** in the **Page** section of **Cell details** to `EUR` and press Enter.
3. Click the empty cell and type `# Orders at a glance`. Press Esc.

## The first stat

4. Press [⌥↓](key:split) (Alt+↓ elsewhere), then `/`, type `Stat` and press Enter. The cell shows a sample: a revenue figure, a change against an earlier value and a small line.
5. In **Cell details**, replace **Number** with the expression below: click the field, select all (⌘A, or Ctrl+A), type, and press Enter.

```sx
(sum (column (rows "orders") "total"))
```

`(column (rows "orders") "total")` is the list of every order's `total`, and [sum](fn:sum) adds it up.

6. Set **Label** to `Taken`. Leave **Show the number as** on **Currency**.
7. Set **Compare with** to `360`. The stat shows how far it is above or below 360, as a percentage, with *vs €360.00* beside it. In **Trend**, type the expression below and press Enter. The small line now draws one point per order.

```sx
(column (rows "orders") "total")
```

## The second stat

8. Press ⌥→ (Alt+→), then `/` **Stat**. Set **Number** to `(len (rows "orders"))` and **Label** to `Orders`.
9. Press **Default** beside **Compare with**, and **Default** beside **Trend**: this one is a count, and the sample comparison and line mean nothing for it. Set **Show the number as** to **Automatic**, which is the first choice in the list.

## The third stat

10. Click the second stat on the sheet so the keys go back to the sheet, then press ⌥→ and `/` **Stat**. Set **Number** to the expression below and **Label** to `Waiting to ship`.

```sx
(count-if (= (get it "status") "New") (rows "orders"))
```

[count-if](fn:count-if) counts the items for which a test is true; `it` is the item being tested.

11. Set **Compare with** to `4`, as if four orders waited last week. Press **Default** beside **Trend**. Set **Show the number as** to **Automatic**. Turn on **Lower is better**: a fall now shows in green, because fewer orders waiting is good news.

## The charts

12. Click the third stat on the sheet, press Esc to select the row of stats, then ⌥↓ and `/` **Bar chart**. In **Numbers**, replace the sample with the expression below. Set **Title** to `Total by customer` and **Show numbers as** to **Currency**.

```sx
(map {label (get it "customer") value (get it "total")} (rows "orders"))
```

A chart takes a list: numbers, `(list label number)` pairs, or records with a `label` and a `value`. [map](fn:map) turns each order into such a record.

13. Click the chart on the sheet, press ⌥→ and `/` **Donut**. In **Numbers**, type the expression below. Set **Title** to `Orders by status`.

```sx
(map (list (get it "key") (get it "count")) (group (rows "orders") "status"))
```

`(group (rows "orders") "status")` gathers the orders by status into records with a `key` (the status), a `count` and the `rows`. The donut shows one slice per status.

## Use it

14. Switch to **Live**. Open the Order tracker (or any document that saves into `orders`), save an order, and come back: the numbers and charts follow the records.

## The finished document

::shot tutorial-dashboard "The finished dashboard in Live: three stats with changes and a trend, a bar chart of totals and a donut of statuses."

Here it is, running on the six sample orders.

```live id=dashboard template=tutorial-dashboard height=520
```

You can open it as a template: the [Orders dashboard](template:tutorial-dashboard) entry on [Templates](/library/templates/) has an **Open in edgy** button.

```sx in=dashboard
(sum (column (rows "orders") "total"))
⇒ 408
(count-if (= (get it "status") "New") (rows "orders"))
⇒ 3
(map (list (get it "key") (get it "count")) (group (rows "orders") "status"))
⇒ (list (list "New" 3) (list "Shipped" 3))
```

## What you learned

- A [stat](kind:stat) shows one number, **Compare with** another to show the change, and a **Trend** line. **Lower is better** turns a fall green.
- A [chart](kind:chart) draws a list: numbers, pairs or records with `label` and `value`. The bar, line, area, donut and meter share one designer.
- [group](fn:group), [map](fn:map), [column](fn:column) and [sum](fn:sum) turn records into what a chart needs. See [Lists](/language/functions/lists/) and [Records](/language/functions/records/).
- Anything that reads `(rows "orders")` follows the collection. See [Collections](/data/collections/).

Next, draw how something works: [Flowchart](/tutorials/flowchart/).
