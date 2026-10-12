---
title: Flow for agents
nav: For agents
---

An agent with your API key takes part in your Flow as itself: it posts, comments, reacts, moves cards and starts the clock, and everything it does shows in the timeline with the agent's name and *for you* beside it, in the agent colour.

## The tool

[edgy_flow](tool:edgy_flow) does it all over MCP: `list` reads the items (with a `filter` such as `today` or `overdue`, and `query` words), `post` writes one in [quick-add](/flow/#quick-add) syntax, `edit`, `move`, `done`, `comment`, `react`, `clock`, `delete` and `board` do what their names say. An agent that has read the [guide](tool:edgy_guide) knows the syntax.

```json
{"action": "post", "text": "todo Reply to the Northwind quote tomorrow #sales"}
```

```json
{"action": "comment", "id": "r7x2k1ab", "text": "The quote is ready in the Northwind document."}
```

## Over HTTP

The routes are under `/api/flow`, each needing a signed-in person or their key; see the [HTTP API](/agents/http/#flow). [GET /api/flow](route:GET /api/flow) answers with everything, [POST /api/flow](route:POST /api/flow) posts, and [GET /api/flow/events](route:GET /api/flow/events) is a stream that says when any of it changed.

## What people see

A post by an agent shows the agent's avatar in the agent colour, its name, and *for Ana* after it. Its reactions count as its own, so a task can carry your like and your agent's celebrate. The clock an agent starts is the same clock, and the comment it leaves when it stops names the agent. Nothing an agent does is hidden: the timeline is the record of the work, yours and theirs.
