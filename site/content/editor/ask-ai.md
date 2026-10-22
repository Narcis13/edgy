---
title: Ask AI
---

Ask AI turns a sentence into code for a cell: you describe what it should do, edgy checks the code that comes back against your document, and you see it, with what it gives, before anything changes.

::shot ask-ai "Ask AI in the code studio: a sentence typed in, the code it became, the value it gives and a short explanation."

## Using it

Open the [code studio](/editor/code-studio/) and choose **Ask AI** at the side, or press the sparkle button, **Ask AI to write it**, in the [formula bar](/editor/formula-bar/).

1. Say what the cell should do, the way you would to a colleague, using the names of your cells: *If total is over 100 then "big" else "small"*. Under the box, example sentences are made from the names in your document. Click one to put it in the box.
2. Press Enter (Shift+Enter starts a new line) or **Write it**.
3. Read the answer. It shows the code, the value the code gives right now, and a sentence or two on what it does and which cells it reads.

```sx
(if (> total 100) "big" "small")
```

Under the answer:

- **Use this** puts the code in the editor in place of what was there. Nothing is kept until you press **Apply** in the studio.
- **Insert at cursor** puts it in where your cursor is, so you can build up code a piece at a time.
- **Try again** asks again, for a different answer.

What it writes depends on what you are editing. In a formula it writes the expression the cell shows. In a button's **Action** it writes an action. In **Hidden when** it writes a condition. In the studio's Events part it can write a whole [handler](term:handler) for the event you are on, or, with **Anything, in words** selected, several handlers, custom actions and timers from one sentence, for example *When the document opens, add one to visits*. Those come back as a list of changes, each in words and code, and **Apply all** makes them in one step: ⌘Z puts them back as they were.

If edgy can't turn the sentence into code that works in your document, it says so and offers sentences that would work, made from your own cell names. Click one to try it.

## Who answers

Three can answer, and edgy asks them in this order, taking the first that gives an answer that checks out:

1. **Claude**, when the server has a key.
2. **An agent** connected to the document.
3. **The built-in composer**, always.

A small badge on the box names who answers: **Claude**, **Your agent** or **Built-in**. It names an agent whenever one is listening, then Claude, then the built-in composer. When both an agent and Claude are available the badge says **Your agent**, but Claude is asked first and answers.

### Claude

Set `ANTHROPIC_API_KEY` in the server's environment and restart it. Asking then goes to the Anthropic API, from the server: the key never reaches the browser. `EDGY_AI_MODEL` names the model; without it edgy uses `claude-sonnet-5-5`. `EDGY_AI=off` turns Claude off even with a key, and `EDGY_AI_BASE_URL` points the server at another address that speaks the same API.

The key is the server owner's (the first account made on it), like the server's secrets, and so is what it costs: Claude answers in the owner's documents, including for the people the owner lets edit them. In everyone else's documents Ask AI uses an agent or the built-in composer. On a server you share with people you trust to spend it, `EDGY_AI_USERS=all` lets Claude answer in every document.

What is sent: your sentence; the code already in the editor; the list of functions; the document as an outline, one line per cell with its id, kind, name, source and current value; and the names of the collections the document can read, with their fields (not their records). Think about that before you turn it on for a document that holds private values.

If the code that comes back doesn't fit the document, edgy tells Claude why and asks once more. A request that takes more than 30 seconds, or fails, is noted, and the next answerer takes over.

### An agent over MCP

An [agent](term:agent) connected to the document can answer instead. It waits with [edgy_listen](tool:edgy_listen), which hands it your messages in [Activity](/editor/activity/) and, as *compose requests*, the sentences people have typed into Ask AI. Each request says which cell it is for, what the cell holds now and what shape of answer it needs. The agent replies with [edgy_answer](tool:edgy_answer): the code and, if it likes, a sentence of explanation. See [Connecting an agent with MCP](/agents/mcp/).

A request goes only to an agent acting for the person who asked: one that signs in with that person's [API key](/people/api-keys/), or, in local mode, an agent on the same machine. Someone else who can edit the document, and their agent, neither sees your requests nor can answer them; their agent listening doesn't count as yours.

An agent counts as listening on a document from the moment it calls `edgy_listen` on it until about half a minute after its last call. While one is, Ask AI says **Waiting for your agent… it can take up to a minute** and holds your request for up to 45 seconds. The code is checked as it arrives, exactly as anything else is: if edgy rejects it, the agent gets the reason back and can answer the same request again. If nobody answers in time, the built-in composer tries instead and the answer says so.

### The built-in composer

The built-in composer needs no key, no agent and no network: it runs in the server and works from phrasings it knows, such as *Sum of price and qty* (in a formula), *Add one to count* (in a button's **Action**), or *When agree changes, copy it into note* (in the Events part). It matches a sentence to code by rules, not by understanding it, so a sentence in other words may get *I could not turn that into code*, with the suggestions. It is the answerer of last resort, and the only one that needs no key and no agent.

## What is checked

Every answer, whoever wrote it, is checked before you see it. The code has to be readable; it may only name cells the document has and functions edgy knows; and an action such as `set!` is only allowed where an action is (a button's **Action**, a handler or a custom action). An answer that fails the check is not shown as one.

Asking needs permission to edit the document.

## If it doesn't work

- **Asking AI isn’t available on this server yet.** The server has no Ask AI route: it is older than this feature.
- **The server could not answer just now.** Try again in a moment.
- **Claude could not answer: …**, shown with the built-in answer or the suggestions. The reason follows: the API refused, it took longer than 30 seconds, or its code didn't fit the document.
