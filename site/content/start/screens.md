---
title: The screens
---

This page walks through every screen you meet as a beginner, in the order you meet them: the library, a document in the editor, the Data page, your profile and the sign-in page, and says what each part of each header does.

## The top bar

The library, the Data page and your profile share one top bar. From left to right:

- **The logo** takes you back to the library.
- **Documents** and **Data** switch between the library and the [Data page](#the-data-page).
- **Docs** opens these docs in a new tab.
- **The sync badge** says whether this machine's changes have reached the cloud: **Sync off** (no cloud set up; see [Sync](/people/sync/)), **Synced**, **Syncing**, **Offline** or **Sync stopped**. Click it to sync now; with sync off it does nothing. Hover for the full sentence.
- **The theme button** switches between the light and the dark theme.
- **Your avatar** opens a small menu with your name and **Profile**. In [local mode](term:local-mode) the menu says *Local account, no sign-in needed* and offers **Sign in as someone else**; otherwise it offers **Sign out**.

## The library

The library is the home page: every document and deck you own, or were given. A fresh install has one document in it, **Start here**.

::shot library "The library: your documents as cards, with search and filters above them."

From the top:

- **New document** starts a blank document and opens it. Under it, **Mine** and **Shared with me** switch between your documents and those other people gave your account access to (a count shows when there are any).
- A row of small pictures, one per [template](/library/templates/). Click one to start a document from it. The row shows in **Mine** when you are not searching and the filter is **All**.
- The **search box** looks in titles, descriptions and the words inside documents. Every word you type has to appear in the same document; the card says where it matched.
- The filters **All**, **Pinned**, **Shared**, **Decks** and **Archived** narrow **Mine**. **Sort** orders by **Last changed**, **Created** or **Title**, and the two buttons beside it show cards as a **Grid** or a **List**. The page remembers your view and sort.

Each card shows a small map of the document (its layout, drawn from its cells), its title, its description (or **Add a description**), when it last changed and badges such as **Pinned** or *Shared · can view*. Pinned documents sit in their own **Pinned** section above the rest.

- Click the title or the map to open the document. A middle click or Ctrl+click opens it in a new tab.
- The tick box at the card's corner selects it. With cards selected, a bar appears with **Pin**, **Archive**, **Delete**, **Group into a deck** (two or more documents) and **Clear**; Esc clears the selection too.
- The **⋯** button opens the card's menu: **Open**, **Edit description**, **Pin** or **Unpin**, **Move up** and **Move down** (for pinned cards), **Share…**, **Export as HTML**, **Archive** or **Restore**, and **Delete**. A deck's menu has **Play**, and **Ungroup** in place of **Delete**; it has no **Share…**. On a document shared with you, the menu has **Open** and **Leave**.

All of this is covered on [Library](/library/). To make a document from scratch, go on to [Your first document](/start/first-document/).

## A document in the editor

Click a card and the document opens in the editor. This is the screen you will spend your time in.

::shot editor-edit "A document in Edit: the header, the formula bar, the document with one cell selected, and Cell details on the right."

Top to bottom, the editor has a header, the formula bar, and three columns: **Activity** on the left, the document in the middle and **Cell details** on the right.

### The header

From left to right:

- **The logo** goes back to the library.
- **The title** is a text field. Click it, type, and press Enter. Leave it empty and the document is called **Untitled**.
- **Saved**, **Saving…** or **Offline, will retry** says whether your changes have reached the server.
- **The sync badge**, as above.
- **Faces** of other people who have the document open. Click one to go to the cell that person has selected. See [Presence](/people/presence/).
- **Undo** and **Redo** (⌘Z and ⇧⌘Z; Ctrl+Z elsewhere).
- **Show what the selected cell reads and feeds** draws lines between a cell and the cells it reads and those that read it. It is on at first.
- **Activity and messages** and **Cell details** open and close the two side panels.
- **Edit**, **Live** and **Page** switch the view. See [Edit, Live and Page](/start/views/).
- **Print (⌘P)** prints the document as pages. **Export as HTML** (owners only) downloads the document as one file that works offline. **Share** opens the sharing dialog. **Docs** and the theme button are as above, then your avatar.

The side panels open by themselves on a wide window: **Cell details** above 1000 pixels, **Activity** above 1320. Once you open or close one yourself, they stay as you left them.

### The formula bar

The strip under the header shows the selected cell. On the left is its name (or its id, such as `c4`, when it has none); then what it holds, as something you can change right there: the text of a text cell, the expression of a formula, the value of an input. For cells that hold code, two buttons open the [code studio](/editor/code-studio/) or **Ask AI to write it**. With nothing selected it shows the document's title and *Select a cell*. See [The formula bar](/editor/formula-bar/).

### The document

The document is the sheet in the middle. In Edit:

- A click selects a cell. Shift+click adds a cell to the selection.
- A **+** appears in the middle of each edge of the selected cell. Press one to split the cell in that direction.
- A small toolbar floats above the selection: split left and right, split top and bottom, merge, swap (with two cells selected), a button naming what the cell holds (it opens the `/` menu), run (on a button), duplicate and clear (or remove, once the cell is empty).
- Thin guides show where cells begin and end, and the lines between cells show what reads what.
- An empty cell says *Type, or press / to choose*.

See [Cells in the editor](/editor/cells/) and [The / menu](/editor/slash-menu/).

### Cell details

The right-hand panel is about the selected cell, and about the document itself when nothing is selected. For a cell it has, from the top:

- A trail of the cells around it (click one to select it) and the cell's kind and id.
- **Name**, so other cells can read it. See [Names and references](/language/names/).
- Sections that fold: **Content** (the controls that make this kind of cell what it is), **Text**, **Spacing and size**, **Box**, **Show only when** and **Events**.
- **Links**, listing the cells it reads and the cells that read it, and the cell's current **Value**.
- **Notation**, the cell written as JSON, which you can edit to replace the cell.

With nothing selected the panel is **Document**: its title, description, width, margin and currency, its typography, its events and, under **Printing**, the page setup. See [The right-hand panel](/editor/panel/).

### Activity

The left-hand panel lists everything that happens to the document: each change as a short expression such as `(split c1 col)`, who made it (you, someone else, or an agent) and when; handlers that ran and what they changed; and messages. At the bottom you can write to an agent that is connected to the document. See [Activity](/editor/activity/).

### On a phone

On a narrow screen (720 pixels or less) the document opens in **Live**, the two side panels become drawers that slide over the document, and the header keeps only what fits: the logo mark, the title, the view switch and **More**, with the sync badge, the faces of others and, in Edit, **Undo** and **Redo**.

::shot editor-phone "A document in Live on a phone: the cells in one column, and a short header with More."

**More** holds the rest:

::shot more-menu "The More menu on a phone."

- **Activity and messages** and **Cell details** open the drawers (**Cell details** is not there for someone who may only view).
- **Show links between cells**.
- **Share…** (**People…** for a viewer).
- **Export as HTML**, for owners.
- **Print**, **Docs**, the theme and **Profile**.

## The Data page

**Data** in the top bar opens the records your documents have saved. A document saves a record into a [collection](term:collection) with [insert!](fn:insert!), and any of your documents can read it back with [rows](fn:rows).

::shot data "The Data page: collections on the left, the records of one as a table."

On the left, the collections with how many records each holds. Click one to see it. On the right, its records as a table, newest first: the first column says how long ago each was saved, then one column per field. The trash button on a row (**Delete this record**) removes that record. **Delete all** removes every record in the collection, after asking.

You can only look and delete here. Records are made by buttons, or by an agent. See [The Data page](/data/data-page/) and [Collections](/data/collections/).

## Profile

Choose **Profile** in your avatar's menu. It is a page of sections, each saving on its own and saying so.

::shot profile "Profile: your name and colour, password, theme and API keys."

- **You**: **Display name**, **Colour** (the colour of your avatar and of your selection when others share a document with you), and **Email**. Press **Save**.
- **Password**: **Current password**, **New password** (at least 8 characters) and **New password again**, then **Change password** (**Set password** if the account has none yet). Changing it signs you out everywhere else; this browser stays signed in.
- **Theme**: **Light**, **Dark** or **Same as the system**. It is kept with your account, so every browser you sign in on looks the same.
- **API keys**: give a key a name and press **Create key**. The key is shown once; copy it, then press **I have copied it**. The list shows when each key was made and last used, with **Revoke**. See [API keys](/people/api-keys/).
- **Delete account**: **Delete account…** asks you to confirm before it removes the account and everything it owns.

## Sign in

You see the sign-in page when edgy runs in accounts mode and you are not signed in, and when you choose **Sign in as someone else** in local mode. In [local mode](term:local-mode) on your own machine you never need it.

::shot signin "The sign-in page."

It is one card. **Email** and **Password**, then **Sign in**. Below the button, **Create an account** switches to the sign-up form, which adds an optional **Name** and asks for a password of at least 8 characters; **Sign in** switches back. After you sign in, edgy takes you where you were going.

After several wrong passwords in a row the button counts down (*Wait 12s*) before it lets you try again. In local mode, the card also has **Continue as** your local account, with the note *This computer needs no sign-in*.

Opening any address while signed out sends you here, except a [share link](/library/share-links/), which never asks. See [Accounts](/people/accounts/) for how the two modes are chosen, and [Install and run](/start/install/#local-mode-and-accounts-mode).

Next: [Your first document](/start/first-document/).
