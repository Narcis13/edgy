---
title: Working with an agent
nav: Agent
---

You connect an AI agent to edgy over MCP, ask it to build a document, and watch its changes arrive in your browser as it makes them. It takes about twenty minutes and an agent that speaks MCP, such as Claude Code. Read [Edit, Live and Page](/start/views/) first, and [Sharing with a colleague](/tutorials/sharing/) if you want the agent to act for a signed-in account.

An [agent](term:agent) works on a document the way you do: through [ops](term:op), the same small instructions a click makes. Nothing is private to the agent, and nothing it does is hidden from you.

## Start edgy

1. In a terminal, in the edgy folder, run `npm run dev`. Open `http://localhost:5173`.

With nothing configured, edgy is in [local mode](term:local-mode): agents on this machine need no key. The signed-in case is further down.

## Connect the agent

The edgy folder holds a file called `.mcp.json`. It declares an MCP server named `edgy`:

```json
{
  "mcpServers": {
    "edgy": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": { "EDGY_URL": "http://127.0.0.1:8787", "EDGY_AGENT_NAME": "Claude" }
    }
  }
}
```

The server is a small program that turns the agent's tool calls into the same HTTP requests the browser makes. `EDGY_URL` is where edgy's API listens, and `EDGY_AGENT_NAME` is the name that appears next to everything the agent does.

2. Open Claude Code in the edgy folder. It reads `.mcp.json` and starts the server. In another project, add the same block to its `.mcp.json` and give `args` the full path to `src/mcp/server.ts` in the edgy folder.
3. To run the server by hand, for any other MCP client, use `npm run mcp`. It talks over standard input and output, so it prints nothing; the client is what starts it.
4. Ask the agent: `List my edgy documents`. It answers from [edgy_docs](tool:edgy_docs). If edgy is not running it says so and tells you to start it with `npm run dev`.

## Ask for a document

5. Ask the agent for a document in plain words. For example:

```text
Using edgy, make a document called Team lunch. It has two number inputs,
people (8) and price each (12.50), a total in euros, a button that saves the
order to a collection called lunches, and a line saying how many lunches
have been ordered.
```

A typical run: the agent reads [edgy_guide](tool:edgy_guide), builds the document with [edgy_create](tool:edgy_create), reads it back with [edgy_read](tool:edgy_read) to check its own work, and gives you a link to it.

## Watch it work

6. Open the link, or find the document in the library. If the left-hand panel is closed, press the **Activity and messages** button in the header.
7. **Activity** lists the agent next to your name, and each of its changes as an op, written the way the language writes them and cut short, such as `(replace c1 ("col …"))` for a whole tree written into a cell, and `(meta currency EUR)` for a setting of the document. Cells it changed flash for a moment with the agent's name over them.

::shot activity "Activity: the agent's changes as ops, with its name, and a line to write to it."

8. Switch to **Live**. Change **People**: the total follows. Press **Order lunch**. In a moment the line below reads *Lunches ordered so far: 1*.
9. Choose **Data** in the home page's header. The collection `lunches` holds the record the button saved.

## Talk to the agent in the document

An agent can sit in a document and wait for you.

10. Ask the agent: `Listen for requests in the Team lunch document`. It calls [edgy_listen](tool:edgy_listen), and the box under **Activity** says *An agent is listening.*
11. In that box, **Ask the agent for something…**, type `Show the total in bold` and press Enter. The agent picks the message up, changes the document with [edgy_apply](tool:edgy_apply) and answers in **Activity** with [edgy_say](tool:edgy_say). The code studio's **Ask AI** reaches a listening agent the same way: it arrives through [edgy_listen](tool:edgy_listen) and is answered with [edgy_answer](tool:edgy_answer).

Everything the agent does is a change in the document's history, listed in **Activity** like yours.

## When edgy asks for sign-in

If edgy runs with accounts (`EDGY_AUTH=accounts`, or reached from another machine), the MCP server needs an [API key](term:api-key) to say whose agent it is.

12. Choose your avatar in the header, then **Profile**. In **API keys**, type a **Name** such as `Claude on my laptop` and press **Create key**. The key is shown once. Press **Copy**, then **I have copied it**.
13. Put the key in the server's settings next to the address, as `EDGY_API_KEY` beside `EDGY_URL`, and start the agent again. Keep the key out of any file you commit: `.mcp.json` is part of your project.

From then on the agent sees and changes only what you can, and **Activity** shows it as *Claude for* and your name. A missing or revoked key gets a plain message from every tool. See [API keys](/people/api-keys/).

## The finished document

::shot tutorial-agent "A document of the kind the agent builds: inputs, a total and a button that saves the order."

An agent's document varies from run to run. This is the one the prompt above should give you, written out; you can open it as a template: the [Team lunch](template:tutorial-agent) entry on [Templates](/library/templates/) has an **Open in edgy** button.

## What you learned

- The MCP server in `.mcp.json` gives an agent the tools listed on [MCP tools](/agents/mcp/). It works through the same ops and HTTP API as the browser. See [Ops](/agents/ops/), [Notation](/agents/notation/) and [the HTTP API](/agents/http/).
- **Activity** shows each op with who made it, and carries messages both ways. See [Activity](/editor/activity/).
- Without accounts an agent needs no key; with them, **Profile** > **API keys** makes one and the agent acts for you. See [API keys](/people/api-keys/).
- Every change an agent makes is an op in the document's history. See [Undo](/editor/undo/).

That is the last tutorial. To look things up, start from [Cells](/cells/) or [The language](/language/).
