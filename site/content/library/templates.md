---
title: Templates
---

A template is a starting document: cells, the settings they need and, for some, sample records; this page covers what a template is, how to start from one, and what each of the eighteen templates shows.

A template is written in [notation](/agents/notation/), the same list of lists an agent writes. Starting from one makes a new document of your own with the cells and settings copied in. Changing your document never changes the template.

Some templates come with sample records. They are saved into the collections the document reads, but only into a collection of yours that is still empty, so opening a template never adds to records you already have. See [Collections](/data/collections/).

## Starting from one

- **On the home page.** Above your documents there is a row of small pictures with titles, one for each of the seven ready-made templates. Click one: a new document opens with its cells. **New document** starts from a single empty cell instead. See [Library](/library/).
- **From these docs.** When the docs are served by edgy, each entry below has an **Open in edgy** button that makes a document from that template. That is how you open the tutorials' documents, which the home page does not list.
- **From a program.** [POST /api/docs](route:POST /api/docs) takes `{"template": "quote"}` and, if you like, a `title`; without a template it makes an empty document. [GET /api/templates](route:GET /api/templates) lists the templates the home page shows. An agent passes `template` to [edgy_create](tool:edgy_create).

Every template, with its id:

::ref templates

## Ready-made documents

Seven of these are on the home page. The eighth, **Start here**, is made for you the first time edgy runs.

::: template quote
A quote you can send. A client, a date and how long it is valid sit above the line items. A line is a row whose amount reads its two neighbours by place, `(* (sib 1) (sib 2))`, so **Add a line** can copy the last one with [dup!](fn:dup!) and **Remove the last** takes it away with [remove!](fn:remove!) while more than one is left. The subtotal adds the amounts of the `lines` group, a [slider](kind:input) takes a discount off, VAT is 19%, and **Save this quote** saves a record into `quotes` with [insert!](fn:insert!). The sentence under it counts them with [rows](fn:rows).

The [Quote tutorial](/tutorials/quote/) builds a smaller one.
:::

::: template savings
A plan you move with sliders. The monthly amount, the years, the yearly rate and the starting sum feed a function held in a hidden [formula](kind:formula) cell, `balance`, that works out compound growth. An [area chart](kind:chart) draws the balance for every year, three formulas give the final sum, what you put in and the growth, and a sentence under them adds a remark when the rate is above 8%.
:::

::: template feedback
A form that saves answers. A name, a rating in stars, a topic from a list and a comment; **Send feedback** saves them into `feedback` with [insert!](fn:insert!) and clears the fields. Beside the form, the answers so far are counted, the average rating changes colour with its value, a [bar chart](kind:chart) counts how many gave each rating and a [table](kind:table) lists the last five.
:::

::: template showcase
A document with every kind of cell at work, planning a team trip. [Stats](kind:stat) with a comparison and a trend, a [checklist](kind:list), a [calendar](kind:calendar) that also shows events saved in `offsite-events`, a budget of line items with **Add a cost**, a [donut and a meter](kind:chart), a searchable roster [table](kind:table), a [signature](kind:canvas), page breaks, and the page setup for printing: A4, a footer with the title.
:::

::: template tables
Data tables at work, for a small studio. Ten sample invoices in `studio-invoices` are grouped by status, with a tick on every row to total them (`(selected invoices)`) and buttons on every row: **Paid** changes the record with [update!](fn:update!), the envelope drafts a reminder with [set!](fn:set!), the bin deletes with [delete!](fn:delete!) after asking. A second [table](kind:table) holds typed rows shown as badges, progress bars, ticks, stars and links, with totals. A bar chart, a calendar of due dates and a section on fonts and text styles follow.
:::

::: template elements
A small shop's order desk. A flowchart whose labels show live numbers from the orders, [tabs](kind:tabs) for **Flow**, **Orders** and **Phone order**, a three-step order form that runs on a hidden step counter, an [accordion](kind:accordion) of questions and a [collapsible](kind:collapsible) that explains how it works. It brings five sample orders for `orders`.

The [Wizard](/tutorials/wizard/) and [Flowchart](/tutorials/flowchart/) tutorials build the two parts you can try on their own.
:::

::: template events
A Saturday market stall that reacts. The document counts its visits when it opens, a [fetch](kind:fetch) cell keeps an exchange rate fresh, a [table](kind:table) handles click and double-click, custom actions fill a basket, **Place the order** saves a record and sends a custom event two cells listen to, a checklist shows a note when every item is ticked, and two [timers](kind:timer) turn an offer and show a tip. Switch to Edit and open a cell's **Events** to see each handler. See [Events and actions](/events/).
:::

::: template tour
A short tour you can poke at. It explains splitting and merging a cell, and shows a slider, a formula and a button at work. edgy makes it for you the first time it runs; it is not in the home page's row of templates, but [POST /api/docs](route:POST /api/docs) takes `{"template": "tour"}`.
:::

## The tutorials' documents

Each of these is exactly what its tutorial's steps make. They are not on the home page; open them from here, or from the tutorial. See [Tutorials](/tutorials/).

::: template tutorial-quote
Two line items that multiply, a subtotal, VAT from a rate you type, a total in euros and a sentence that reads them. Built in [A quote that adds itself up](/tutorials/quote/).
:::

::: template tutorial-checklist
A list whose [change](event:change) handler shows a message and saves a record into `checklists` once every item is ticked, using [every](fn:every), [show!](fn:show!) and [insert!](fn:insert!). Built in [A checklist that reacts](/tutorials/checklist/).
:::

::: template tutorial-wizard
A hidden `step` counter, three questions that each hide unless it is their turn, and **Back**, **Next** and **Start again** buttons that change the counter with [set!](fn:set!). Built in [A form in steps](/tutorials/wizard/).
:::

::: template tutorial-order-tracker
A form that saves orders, a table that reads them with `(rows "orders")`, and a **Shipped** button on every row that changes the record with [update!](fn:update!). It brings six sample orders for `orders`. Built in [Saving and tracking orders](/tutorials/order-tracker/).
:::

::: template tutorial-dashboard
Three [stats](kind:stat) with a comparison and a trend, a bar chart and a donut, all worked out from the records in `orders`. It brings the same six sample orders. Built in [A dashboard from records](/tutorials/dashboard/).
:::

::: template tutorial-flowchart
A [diagram](kind:diagram) of how an order moves, with a number above it that two of its labels show. Built in [A flowchart with live numbers](/tutorials/flowchart/).
:::

::: template tutorial-deck
The middle slide of the deck made in [Documents played as slides](/tutorials/deck/): a heading and two stats. The deck itself is not a template, because a deck groups documents you already have.
:::

::: template tutorial-sharing
A checklist and a notes field, the document that [Sharing with a colleague](/tutorials/sharing/) gives to a colleague as an editor and as a viewer.
:::

::: template tutorial-print-export
A two-page report with wide margins, a footer with the title and page numbers, and a [page break](kind:break) between its pages, printed and exported in [Printing and exporting](/tutorials/print-export/).
:::

::: template tutorial-agent
The kind of document an agent builds from one sentence in [Working with an agent](/tutorials/agent/): two inputs, a total and a button that saves the order into `lunches`.
:::
