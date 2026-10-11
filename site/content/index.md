---
title: The edgy documentation
nav: Start here
---

These pages teach edgy from the first cell to the code that moves an op from your keyboard to the other browsers and the cloud.

edgy makes active documents out of cells. A document starts as one cell; you split it, choose what each cell holds (text, an input, a formula, a button, a chart, a table…), name the cells that others read, and the document starts to calculate, react and save records. People and agents work on the same document at the same time.

<ul class="paths">
<li><a href="start/install/"><b>Learn</b><span>Install edgy, build your first document, then ten tutorials that each add one idea: formulas, events, data, charts, diagrams, decks, sharing, paper and agents.</span></a></li>
<li><a href="cells/"><b>Reference</b><span>Every kind of cell, every function and event, the editor, styling, the library, people and the agents’ API, to look things up.</span></a></li>
<li><a href="internals/"><b>Under the hood</b><span>How edgy works inside: the model, ops and undo, the engine, the interpreter, the event stream, storage, access, sync and export.</span></a></li>
</ul>

## Try a cell

This is a real edgy document running in the page. Change the quantity or the price and the total follows.

```live id=hello title="Two inputs and a formula" height=150
["row",
  ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 3}],
  ["input", {"name": "price", "type": "number", "label": "Price", "value": 12.5}],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]
```

The formula is `(* qty price)`: multiply the cell named `qty` by the cell named `price`.

```sx in=hello
(* qty price)
⇒ 37.5
```
