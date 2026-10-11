---
title: A quote that adds itself up
nav: Quote
---

You build a quote with two line items, a subtotal, VAT and a total, and learn how formulas read other cells, how a result is formatted and how a sentence can quote a value. It takes about twenty minutes. Read [Your first document](/start/first-document/) and [Edit, Live and Page](/start/views/) first if you have never split a cell.

You will use the [text](kind:text), [input](kind:input) and [formula](kind:formula) cells, names, a relative reference, a format and a [text template](/language/templates/).

## Start the document

1. On the home page, press **New document**. The document opens in **Edit** with one empty cell, and **Cell details** shows the **Document** panel on the right.
2. Click the title at the top, select all (⌘A, or Ctrl+A), type `Quote` and press Enter.
3. With no cell selected, find **Currency** in the **Page** section of **Cell details**. Type `EUR` and press Enter. Every formula you set to **Currency** now writes euros.

## The client

4. Click the empty cell to select it and press `/`. Type `Text field` and press Enter. The cell becomes a field people type into.
5. In **Cell details**, set **Name** to `client`, **Label** to `Client` and **Value** to `Ada Lovelace`. To set a field, click it, select all (⌘A, or Ctrl+A), type, and press Enter.
6. Press [⌥↑](key:split) (Alt+↑ elsewhere). A new empty cell appears above the field, selected. Type `# Quote for {{client}}` and press Esc.

The `#` makes a heading. The words between double braces are a [text template](/language/templates/): the cell shows the value of the cell named `client`, and follows it. The heading now reads *Quote for Ada Lovelace*.

## One line item

A line is a row of four cells: what, how many, the price, and the amount.

7. Press Tab to select the next cell, the **Client** field. Press [⌥↓](key:split) (Alt+↓) to add a cell below it. Press `/`, type `Text field`, press Enter. Set **Label** to `Item` and **Value** to `Brand identity`.
8. Press ⌥→ (Alt+→). The cell splits in two side by side and the new one is selected. Press `/`, type `Number`, press Enter. Set **Label** to `Qty` and **Value** to `1`.
9. Press ⌥→ again. Choose `/` **Number**. Set **Label** to `Price` and **Value** to `2400`.
10. Press ⌥→ again. Choose `/` **Formula**. The cell opens for typing. Type the expression below and press Enter.

```sx
(* (sib 1) (sib 2))
```

`(sib 1)` is the cell at place 1 among the cells in the same row, counting from 0: the **Qty** field. `(sib 2)` is the **Price** field. Reading neighbours by place, instead of by name, is what lets you copy the whole row in a moment and keep a working formula.

11. With the formula cell still selected, set **Show the result as** to **Currency**, then **Name** to `amount` and press Enter. The cell reads *€2,400.00*.

## A second line item

12. Press Esc. The selection moves out to the row that holds the four cells. Press ⌘D (Ctrl+D) to duplicate it. A copy of the row appears below, and its amount cell is called `amount2`: a copied name gets the next number.
13. In the copy, click the **Item** field, select all and type `Website design, per page`. Do the same in **Qty** with `6` and in **Price** with `380`. The copy's amount reads *€2,280.00* without anyone touching its formula.

## Subtotal, VAT and total

14. Click the second row's amount cell, press Esc to select its row, and press ⌥↓. A new cell appears below the row. Type `Subtotal` and press Esc.
15. Press ⌥→, then `/` **Formula**. Type the expression and press Enter. Set **Show the result as** to **Currency**, then **Name** to `subtotal`.

```sx
(+ amount amount2)
```

16. Press Esc to select the row, then ⌥↓. Press `/` **Number**. Set **Label** to `VAT rate (%)`, **Value** to `19` and **Name** to `rate`.
17. Press ⌥→, then `/` **Formula**. Type the expression, press Enter, set **Show the result as** to **Currency**, then **Name** to `vat`.

```sx
(* subtotal (/ rate 100))
```

18. Press Esc, then ⌥↓. Type `**Total**` and press Esc. Press ⌥→, then `/` **Formula**. Type the expression, press Enter, set **Show the result as** to **Currency**, then **Name** to `total`.

```sx
(+ subtotal vat)
```

19. Press Esc, then ⌥↓. Type this sentence and press Esc.

```text
{{client}} owes **{{total | currency}}**, VAT included.
```

`| currency` is a format: it writes the number the way **Show the result as** > **Currency** would. The formats are listed on [Formats](/language/formats/).

## Use it

20. Switch to **Live**. Change **Qty** on the first line to `2`: the amount, the subtotal, the VAT, the total and the sentence all change in the same moment. Change **Client** to `Grace Hopper`: the heading and the sentence follow.

## The finished document

::shot tutorial-quote "The finished quote in Live: two lines, a subtotal, a VAT rate, a total and the sentence."

Here it is, running. Change a quantity and watch the total.

```live id=quote template=tutorial-quote height=560
```

You can open it as a template: the [Simple quote](template:tutorial-quote) entry on [Templates](/library/templates/) has an **Open in edgy** button.

```sx in=quote
subtotal
⇒ 4680
(round vat 2)
⇒ 889.2
(round total 2)
⇒ 5569.2
(set! rate 0)
(round total 2)
⇒ 4680
```

The last two lines set the VAT rate to 0, and the total becomes the subtotal. Nobody told the total to change: it reads `subtotal` and `vat`, and `vat` reads `rate`.

## What you learned

- A formula reads other cells by name: `(+ subtotal vat)`. Give a cell a name in **Name** and any expression can use it. See [Names and references](/language/names/).
- `(sib 1)` reads a neighbour by place, so a copied row keeps working. Copied names count up: `amount`, `amount2`.
- **Show the result as** writes a number as currency, a percentage or a date without changing the number. See [Formats](/language/formats/).
- A [text template](/language/templates/) puts a value into a sentence: `{{total | currency}}`.
- Typing `=` in an empty cell makes a formula without the `/` menu. See [formula](kind:formula).

Next, make a document react to what people do: [Checklist](/tutorials/checklist/).
