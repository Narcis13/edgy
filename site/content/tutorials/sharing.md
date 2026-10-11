---
title: Sharing with a colleague
nav: Sharing
---

You give a colleague access to a document as an editor, then as a viewer, make a link anyone can open, and watch what each of them sees. It takes about twenty minutes and two browser windows. Read [Edit, Live and Page](/start/views/) first, because the three roles differ in which of those views they get.

You will use the **Share** dialog, **Shared with me** in the library, [presence](term:presence) and [share links](term:share-link). The three roles are the [owner, editor and viewer](term:role).

## Turn on accounts

On your own machine edgy signs you in as a local account and has nobody to share with. Start it so it asks for sign-in, which makes every person an account of their own. In a terminal, in the edgy folder:

```text
EDGY_AUTH=accounts npm run dev
```

On Windows PowerShell write `$env:EDGY_AUTH = "accounts"; npm run dev`. See [Accounts](/people/accounts/).

1. Open `http://localhost:5173`. Choose **Create an account**. Fill in **Name** (`Ada Lovelace`), **Email** (`ada@example.test`) and a **Password** of at least 8 characters, and press **Create account**. This is you, the owner.
2. Open a private browser window next to the first one. Go to `http://localhost:5173/signup` and create a second account: **Name** `Ana Silva`, **Email** `ana@example.test`, any password of 8 characters or more. This is your colleague. Keep both windows in view.

## A document to share

In your window:

3. Press **New document**. Type `Planning notes` in the title and press Enter.
4. Click the empty cell and type `# Planning notes`. Press Esc. Press [⌥↓](key:split) (Alt+↓ elsewhere), then `/`, type `Checklist` and press Enter. Set **Title** to `Actions`.
5. Press ⌥↓, then `/` **Long text**. Set **Name** to `notes`, **Label** to `Notes` and **Placeholder** to `Write what was decided`.
6. Press ⌥↓. Type `Notes so far: {{notes}}` and press Esc.

## Give Ana access as an editor

7. Press **Share** in the header. The dialog lists **People**: you, as *Owner*.
8. Under **Add people**, type `ana@example.test` in **Email of their account**, leave the access on **Can edit** and press **Add**. Ana joins the list, with a menu for her access and a **Remove** button.

::shot share-dialog "The Share dialog: the people with access, and the can view and can edit links."

## What Ana sees

In Ana's window:

9. Open the home page and choose **Shared with me**. Your document is there, marked with your name and **Can edit**. Open it.
10. She has **Edit**, **Live** and **Page**, and **Cell details**. Your avatar shows in the header: that is [presence](term:presence), who else has the document open.
11. In **Live**, she ticks an action and types a note. In your window the tick and the note appear as she makes them, and **Activity** lists each change under her name.
12. In **Edit**, she clicks the **Notes** field. In your window, in Edit, that cell gets an outline in her colour with her name on it. Click her avatar in your header to scroll to the cell she is on.

::shot presence "Two people in one document: their avatars in the header and an outline on the cell each has selected."

Two people editing different cells both keep their changes.

## Make Ana a viewer

13. In your window, open **Share** again. Change the menu beside Ana's name from **Can edit** to **Can view**.
14. Watch Ana's window, without reloading it. If she was in **Edit**, she is moved to **Live**. The **Edit** button is gone, **Cell details** is gone, and the header says **Can view**. A note above the document says *You can view this document, not change it. What you type here stays in this tab.* She can still use the document in **Live** and see it in **Page**.
15. Ana ticks an action. Her tick shows in her window. In yours nothing changes, and when she reloads, her tick is gone: a viewer's changes are never saved.

## Share a link

A link is for people without an account. Only the owner makes one.

16. In your **Share** dialog, find the **Can view** row and press **Make a link**. The address appears with a **Copy** button. Press **Copy**.
17. In a second private window (it has no account), paste the address. The document opens in **Live** with a **View only** badge and the note *You can try the inputs and buttons; nothing you change here is saved.* There is no editor and no way to your other documents.
18. Press **Make a link** on the **Can edit** row too, and open that address in the same way. The badge reads **Can edit**, and what the person changes is saved and shows in your window as it happens.
19. Press **Turn off** on the **Can edit** row. The page that address opened says *No longer shared*. Turning a link off is for good: **Make a link** makes a new, different address.

> [!NOTE]
> edgy listens on your machine only, so a link opens for other people once edgy is hosted where they can reach it. The dialog says so.

## Take Ana out

20. In the dialog, press **Remove** beside Ana. In her window, at once, the document is replaced by *No longer shared with you* and a **Back to your documents** button.

## The finished document

::shot tutorial-sharing "The document the tutorial shares: a checklist and a notes field."

This is the document. It has no hosted link in the docs, but you can open it as a template: the [Planning notes](template:tutorial-sharing) entry on [Templates](/library/templates/) has an **Open in edgy** button.

## What you learned

- The owner shares from **Share**: people by the email of their account, as **Can edit** or **Can view**, and links as view or edit. See [Sharing with people](/people/sharing/) and [Share links](/library/share-links/).
- An editor changes the document, a viewer reads and uses it in Live without saving anything, and only the owner shares, exports and deletes. See [Accounts](/people/accounts/).
- Everyone in a document sees who else is there and the cell each has selected. See [Presence](/people/presence/).
- **Activity** names who made each change, people and agents alike. See [Activity](/editor/activity/).

Next, get a document ready for paper: [Printing and exporting](/tutorials/print-export/).
