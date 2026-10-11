---
title: Agents
---

An agent works on edgy the way a person does: it reads a document, then changes it with the same [ops](term:op) a person's clicks make, through the HTTP API. This section is for the people who build and run agents, and for anyone who wants to know what an agent can do in their documents.

## How an agent works

Every change in edgy is an op: splitting a cell, typing in an input, dragging a cell to another place. A person's browser sends ops to the server, and an agent sends the same ones, in the same list, to the same route. Both land in one history, and every browser that has the document open sees them at once. An agent has no private way in: it changes a document only with ops.

An agent reaches edgy in one of two ways:

- **The HTTP API.** Any program that speaks JSON can read a document, send ops, save records and wait for a person's message. See [The HTTP API](/agents/http/).
- **The MCP server.** For an AI model that uses tools, the repository ships a server that offers the API as tools: `edgy_read`, `edgy_apply` and the rest. It adds the lookup of documents by title and the report of errors after each change. See [The MCP server](/agents/mcp/).

### Keys

An agent acts for a person, with that person's [API key](/people/api-keys/): you make one in **Profile → API keys**, and it is shown once. With a key an agent sees and changes only what its person can. In [local mode](term:local-mode), on your own machine with nothing configured, agents on the same machine need no key.

::shot api-keys "Profile → API keys: each key is listed by its name and when it was made."

### What a person sees

Everything an agent does shows in **Activity and messages**, the panel on the left of the editor: each op as the agent acting for its person ("Claude for Ada"), with the time, and whatever the agent says to the person. A person writes to the agent from the same panel, and the agent can wait for it. While an agent waits, the panel says that an agent is listening.

::shot activity "Activity: each change with who made it and when, people and agents alike."

When a person asks **Ask AI** for code and an agent is listening, the request goes to the agent, unless the server has an Anthropic key: then Claude is asked first and the agent only if Claude can't answer. See [Ask AI](/editor/ask-ai/) and [POST /api/docs/:id/compose](route:POST /api/docs/:id/compose).

## A first conversation

Here is what an agent does, in the order it does it. The tool names are the MCP server's; each one calls the API.

1. **Read the guide** once, with [edgy_guide](tool:edgy_guide), or [GET /api/guide](route:GET /api/guide).
2. **Find or make the document:** [edgy_docs](tool:edgy_docs) lists and searches; [edgy_create](tool:edgy_create) makes one, with the whole document in a single call.
3. **Read it** with [edgy_read](tool:edgy_read): the [outline](/agents/notation/) shows every cell with its id, name, source and value.
4. **Change it** with [edgy_apply](tool:edgy_apply): a few ops, applied together or not at all. The answer is the new outline and the errors.
5. **Say what it did** with [edgy_say](tool:edgy_say), and **wait for the answer** with [edgy_listen](tool:edgy_listen).

Without MCP, the same steps over HTTP read like this:

```http
POST /api/docs
Authorization: Bearer edgy_…
Content-Type: application/json

{"title": "Quote", "root": ["col",
  ["input", {"name": "qty", "type": "number", "value": 2}],
  ["formula", {"name": "total"}, ["*", "$qty", 40]]]}
```

The answer holds the new document's id. Then one op changes it:

```http
POST /api/docs/xebuqd2c/ops
Authorization: Bearer edgy_…
Content-Type: application/json

{"actor": {"kind": "agent", "name": "Claude"}, "ops": [["set", "qty", "value", 5]]}
```

The answer lists the op as applied, the cells it touched, and the outline with the new total, 200. The [agents tutorial](/tutorials/agent/) is the hands-on version.

## What to read first

Read in this order: how a document looks to an agent, how it is changed, then the two ways in.

::ref pages agents/notation/
::ref pages agents/ops/
::ref pages agents/http/
::ref pages agents/mcp/

## The agents' own reference

`/api/guide` is the compact reference that an agent reads; [GET /api/guide](route:GET /api/guide) and [edgy_guide](tool:edgy_guide) return it as one piece of text. It holds the notation of every kind of cell, every function of the language, the events, the ops, the records and the rules for working well. The list of functions and fonts in it is made from the same lists as the editor's, so it is never behind.

Agents are given the guide, not these pages. These pages explain the same things for people, with more words and more examples, and they list what the guide leaves out: each route, each tool, who may call what, and the messages an agent gets back when it is wrong.

Source: [tools.ts](src:src/mcp/tools.ts) (the MCP tools), [app.ts](src:src/server/app.ts) (the routes), [reference.ts](src:src/core/reference.ts) (the guide).
