---
title: Activity and messages
nav: Activity
---

**Activity**, the panel on the left of the editor, lists every change made to the document as it happens, says who made each one (a person, an agent working for a person, or a handler), and holds the conversation with an agent.

::shot activity "Activity: a person's change and an agent's change as s-expressions, a message to the agent, and the line where you write to it."

Open it with the **Activity and messages** button in the header (in the **More** menu on a phone). It opens by itself in a window wider than 1320 pixels. When you open a document with a share link, you see the document as it is now: there is no history and no conversation.

## Who is here

At the top, small chips show who has the document open: you (your name followed by *(you)*, or **You** where there are no accounts), the other people (point at one to see whether they are editing or reading and which cell they have selected), and any [agent](term:agent) that has been in the document in the last ten minutes. Point at an agent's chip to see what it was doing, and when: listening for a message, reading, editing or idle. See [Presence](/people/presence/).

## Changes

Below that is the feed, oldest first, ending with the newest. Each change is shown as the [op](term:op) it is, written as an s-expression:

```text
(set c2 value 5)
(set c6 expr (* qty price))
(split c4 row)
(merge c4 c7)
(replace c3 ("text …"))
```

A cell is shown by its id, such as `c4`, because that is what the document records, even when an agent sent the cell's name. Names still appear inside expressions, as in `(* qty price)`. A long op is cut short with `…`, and a whole new cell is shown as its kind only, so `("text …")` stands for a text cell. Reading the feed teaches you what an op looks like, and an agent works in the same terms: see [Ops](/agents/ops/).

Changes are grouped so the feed stays readable. A run of changes by the same author within a few seconds shares one block with one name and one time. When someone sets the same property again and again, for example by typing, the block shows only the last value and a count, like `×12`.

A line marked *skipped: conflict, changed nothing* is a change that [sync](/people/sync/) put after another machine's change that it no longer applied to. It is kept in the list so you can see what happened.

### Who made a change

The name at the top of a block is:

- **You** for your own changes.
- A person's name, as their account is named now. A person who renames their account is shown by the new name, on their old changes too.
- **Guest** for someone who opened the document with a [share link](term:share-link).
- An agent's own name followed by **for** and the person it works for, for example *Claude for Ana*, when the agent uses that person's [API key](term:api-key). The change is that person's, made by the agent.
- **Events** for changes the server's [handlers](term:handler) made: timers, fetches and changes caused by an agent.

When someone else changes a cell, it is outlined for a moment with their name on it, so you can see where it happened.

### Handlers

When a [handler](term:handler) runs, the feed shows an **Events** block directly before the changes it made: the event, the cell it came from, and for each handler the ops it made, the records it saved, and the events it sent on. A handler that changed nothing says so. One that failed shows its error in red. A handler that ran on the server instead of in your browser is marked *on the server*, and one you set off by hand with **Try it** in the code studio is marked with a flask. See [Events and actions](/events/).

## Messages

The box at the bottom is for the agent. Write what you want and press Enter (Shift+Enter starts a new line). The message appears in the feed, with a chip for the cell you had selected when you sent it; press the chip to select that cell again.

The line above the box says whether anyone will read it:

- *An agent is listening.* An agent is waiting for messages in this document.
- *An agent was here; your message waits for it.* An agent was here lately but is not waiting now.
- *No agent is connected. Messages wait here until one is.*

**Connect one** shows the setting that adds edgy to an agent's tools. See [Connecting an agent with MCP](/agents/mcp/).

The agent reads your message with [edgy_listen](tool:edgy_listen), which waits until you write. It answers with [edgy_say](tool:edgy_say), and its message appears in the feed under its name, with a chip for the cell it is about, if it named one. An agent also leaves a message with `edgy_say` to say what it changed or to ask you something. A message written while nobody listened stays in the feed, and an agent that listens later can read it.

A person who may only read a document sees Activity but has no box to write in.

The feed shows the last 120 blocks, and the document's history keeps the rest. The code is in [Activity.tsx](src:src/web/editor/Activity.tsx).
