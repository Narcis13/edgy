---
title: A form in steps
nav: Wizard
---

You build an order form that asks one question at a time, with **Back**, **Next** and **Start again** buttons, and learn how a hidden value can drive what a document shows. It takes about twenty minutes. Read [A checklist that reacts](/tutorials/checklist/) first, because buttons and handlers both run actions.

You will use a [data](kind:data) cell, [input](kind:input) cells, [button](kind:button) cells, the **Show only when** setting and the action [set!](fn:set!).

The idea: a data cell named `step` holds 1, 2 or 3. Each question hides unless `step` says it is its turn, and the buttons change `step`.

> [!NOTE]
> Pressing a button in Edit runs it, as it does in Live. While you build, select a button by creating it, or with Tab and Shift+Tab, and do not click it.

## The counter and the heading

1. On the home page, press **New document**. Type `Order wizard` in the title and press Enter.
2. Click the empty cell and press `/`. Type `Data` and press Enter to choose **Data (hidden)**. Set **Name** to `step` and press Enter. Set **Value** to `1` and press Enter. Readers never see a data cell, and in Edit it shows as a small chip.
3. Press [⌥↓](key:split) (Alt+↓ elsewhere). Type `Step {{step}} of 3` and press Esc. The text template shows the counter's value.

## Step 1: who

4. Press ⌥↓, then `/`, type `Text field` and press Enter. Set **Name** to `customer`, **Label** to `Who is the order for?` and **Value** to `Ada Lovelace`.
5. In **Cell details**, open **Show only when** (click its heading) and choose **Depends…**. In **Hide it when**, type the condition below and press Enter.

```sx
(!= step 1)
```

The field now hides whenever `step` is not 1. In Edit every cell stays on the sheet, dimmed when it would hide; in Live it really hides.

## Step 2: how many

6. Press ⌥↓, then `/` **Number**. Set **Name** to `qty`, **Label** to `How many mugs?` and **Value** to `2`.
7. In **Show only when**, choose **Depends…** and type `(!= step 2)` in **Hide it when**. Press Enter.

## Step 3: check

8. Press ⌥↓. Type the text below and press Esc.

```text
**{{qty}} mugs** for {{customer}}. Check them, then start again for the next order.
```

9. In **Show only when**, choose **Depends…** and type `(!= step 3)`. Press Enter.

## The buttons

10. Press ⌥↓, then `/` **Button**. In **Look**, choose **Quiet**. Set **Label** to `Back`. In **What it does**, type the action below and press Enter. In **Show only when**, choose **Depends…** and type `(<= step 1)`. Back has nothing to go back to on the first step.

```sx
(set! step (- step 1))
```

11. Press ⌥→ (Alt+→) to add a cell beside it, then `/` **Button**. Set **Label** to `Next`. In **What it does**, type `(set! step (+ step 1))`. In **Show only when**, choose **Depends…** and type `(>= step 3)`.
12. Press ⌥→, then `/` **Button**. In **Look**, choose **Soft**. Set **Label** to `Start again`. In **What it does**, type the action below. In **Show only when**, choose **Depends…** and type `(!= step 3)`.

```sx
(do (set! step 1) (set! customer "") (set! qty 1))
```

[set!](fn:set!) gives a cell a new value: `(set! step (+ step 1))` reads `step`, adds one and stores it. [do](fn:do) runs several actions as one, in order.

## Use it

13. Switch to **Live**. Only the first question and **Next** show. Press **Next**: the second question replaces the first, and **Back** appears. Press **Next** again: the summary shows, **Next** goes and **Start again** takes its place. Press **Start again** to go back to step 1 with the form cleared.

A tabs cell can do the same with a tab bar; here the buttons own the order, so the reader can't jump ahead. See [tabs](kind:tabs).

## The finished document

::shot tutorial-wizard "The finished form on its third step: the summary, and the Start again button."

Here it is, running. The data cell is in the page too; you can't see it.

```live id=wizard template=tutorial-wizard height=240
```

You can open it as a template: the [Order wizard](template:tutorial-wizard) entry on [Templates](/library/templates/) has an **Open in edgy** button.

```sx in=wizard
step
⇒ 1
(set! step (+ step 1))
(set! step (+ step 1))
step
⇒ 3
(set! step 1)
(set! customer "")
customer
⇒ ""
```

## What you learned

- A [data](kind:data) cell holds a value for formulas and actions and is invisible to readers. Change it with [set!](fn:set!).
- **Show only when** > **Depends…** takes a condition; the cell hides while it is true. See [Truth](/language/truth/) and the **hidden** prop in [Cells](/cells/).
- A button's **What it does** is an action, and [do](fn:do) joins several. See [button](kind:button) and [Events and actions](/events/).
- A value that several cells read, such as `step`, is the simplest way to share state in a document. See [Names and references](/language/names/).

Next, save what people enter: [Order tracker](/tutorials/order-tracker/).
