---
title: The editor
---

The editor is the screen where you shape a document: it has a header, a formula bar, the document itself, and panels on either side that you open when you need them.

::shot editor-edit "The editor in Edit: the header across the top, the formula bar under it, the document with one cell selected, and Cell details on the right."

## The parts of the screen

| Part | Where | What it is for |
| --- | --- | --- |
| [Header](#the-header) | Across the top | The title, the three views, undo, sharing, printing. |
| [Formula bar](#the-formula-bar) | Under the header | The name and the source of the selected cell. |
| [The document](#the-document) | The middle | The cells themselves; you select, split and merge them here. |
| [Cell details](#cell-details) | Right | Everything about the selected cell, or about the document when none is selected. |
| [Activity](#activity) | Left | Every change, who made it, and a line to an agent. |
| [The code studio](#the-code-studio) | Over everything | A roomy place to write a cell's code. |

## The header

From left to right:

- The logo takes you back to the [library](term:library).
- **Document title** is a field. Type to rename the document; Enter or Esc leaves the field, and an empty title becomes *Untitled*.
- A small note says **Saved**, **Saving…** or **Offline, will retry**. While the server doesn't answer, the editor keeps your changes in the open tab and keeps trying; leave the tab open until it says **Saved**. See [Sync](/people/sync/) for the badge next to it.
- Faces of the other people who have this document open. Click one to jump to the cell that person has selected. See [Presence](/people/presence/).
- **Undo** and **Redo** (⌘Z and ⇧⌘Z). See [Undo and redo](/editor/undo/).
- A button that turns [links between cells](/editor/links/) on and off.
- Buttons that open and close [Activity](/editor/activity/) and **Cell details**.
- **Edit**, **Live** and **Page**: the three [views](term:view) of a document. **Edit** shapes it, **Live** uses it as people will, **Page** shows it as printed pages. See [Edit, Live and Page](/start/views/).
- **Print** (⌘P), and, for the owner, **Export as HTML**.
- **Share** opens the dialog that makes links and invites people. See [Sharing with people](/people/sharing/).
- **Docs** opens these docs in a new tab, a button switches between the light and dark themes, and the account menu leads to your profile.

On a narrow window the header keeps the title, the views and **More** (the three dots). **More** holds the rest: **Activity and messages**, **Cell details**, **Show links between cells**, **Share…**, **Export as HTML**, **Print**, the theme, **Docs** and **Profile**. A window narrower than 720 pixels opens documents in **Live**, because a phone is mostly used to use a document; press **Edit** to shape it.

> [!NOTE]
> Someone who may only read a document sees **Can view** in place of **Edit**, and gets no Undo, no Cell details and no way to change anything. What they type in Live stays in their own tab. See [Sharing with people](/people/sharing/).

An archived document opens with a bar that says so and a **Restore** button; nothing in it is lost.

## The formula bar

The strip under the header shows the selected [cell](term:cell): its name (or its id when it has none) and its source, the way a spreadsheet shows a formula. Edit the source there and press Enter. It is described in [The formula bar](/editor/formula-bar/).

## The document

The middle of the screen is the document itself. In **Edit**:

- Click a cell to select it. A toolbar appears above it, and a **+** on each of its four edges.
- Split, merge, duplicate, clear, remove and resize cells here. See [Working with cells](/editor/cells/).
- Press `/` to choose what a cell holds. See [The / menu](/editor/slash-menu/).
- Type straight into a text cell or an empty one.

## Cell details

The panel on the right is **Cell details**. It opens by default when the window is wider than 1000 pixels. With a cell selected it shows that cell: its name, what it holds, its text, spacing and box, and what it does when something happens. With nothing selected it shows the document's own settings. See [The right-hand panel](/editor/panel/).

## Activity

The panel on the left is **Activity**. It opens by default when the window is wider than 1320 pixels. It lists changes as they are made, by people and by agents, and holds the conversation with an agent. See [Activity and messages](/editor/activity/).

> [!NOTE]
> Once you open or close a panel by hand, the editor stops following the window's width and keeps your choice. On a phone (a window 720 pixels wide or narrower) a panel opens over the document, and a click outside it closes it.

## The code studio

Press ⌘E on a selected cell that holds code, or the expand button next to a code field, and the code studio opens over the editor. It has a text editor, **Blocks** to build the same code by clicking, and **Ask AI** to write it from a sentence. See [The code studio](/editor/code-studio/) and [Ask AI](/editor/ask-ai/).

## In this section

::ref pages editor/cells/,editor/slash-menu/,editor/panel/,editor/formula-bar/,editor/code-studio/,editor/ask-ai/,editor/activity/,editor/links/,editor/minimap/,editor/undo/,editor/page-view/

The keys that work in the editor are all on [The keyboard](/start/keyboard/).
