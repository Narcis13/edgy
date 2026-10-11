# Brief for the writers of the edgy docs

You are writing part of the documentation site for edgy (this repository: a React + Hono app where documents are trees of cells; see README.md). The site's source is `site/`; the pages are Markdown in `site/content/`. Readers are (1) a beginner who has never seen a cell and (2) a developer who wants to know how edgy works inside. Wrong docs are worse than none: **every claim must come from reading the code**, not from guessing or from the README alone.

## Read these first (they are short)

1. `site/content/contributing/docs.md`: the page format, every building block (entries `::: fn x`, `::ref`, `sx` blocks with `⇒` results, `live`/`notation`/`ops` blocks, `::shot`, `::clip`, `::diagram`, callouts, link schemes `fn:`, `kind:`, `event:`, `/path/`, `src:`), and **the style guide**. Follow it exactly.
2. `site/content/glossary.md`: the words. One word for one thing; use these.
3. `site/content/cells/button.md`: a finished page to match in depth, tone and structure.
4. `site/nav.ts`: where your pages sit and in what order (previous/next follow it).
5. `site/scripts/shots.mjs`: the screenshot and clip names that exist. Use only these names with `::shot` / `::clip`. If a page needs a picture that isn't listed, say so in your report (name, what it should show); don't invent a name.

Diagrams being drawn by another writer, which you may place with `::diagram <name>` where they explain: `cell-tree` (a cell tree before and after split and merge), `op-life` (an op from a keystroke to the other browsers and the cloud log), `event-dispatch` (an event, its handlers, what they change, the events that sets off), `sync-logs` (the local op log and the cloud log, push and pull), `access-model` (who is asking → what a route needs → roles on a document), `eval-graph` (cells, what each reads, the order values are worked out), `pagination` (a document cut into printed pages).

## Rules

- Write **only the files listed for you**. Don't edit anything else (not `site/nav.ts`, not the glossary, not `site/build/`, not `src/`, unless your part says so). If something outside your files is wrong or missing, put it in your report.
- Every page: front matter `title` (and `nav` if the title is long), then a first paragraph whose **first sentence says what the page covers**. Headings start at `##`, no skipped levels.
- Plain, concrete, second person, short sentences; the UI's exact labels in bold (find them in the `.tsx` files); no marketing words ("simply", "just", "powerful", "seamless", "easily"), no exclamation marks, no emoji. Example names only (Ada Lovelace, Northwind Studio, `ana@example.test`); never a real token or password.
- Show, then explain: an example first where one helps. Prefer a `live` example (a real document the reader can use) where playing teaches better than reading; keep each small (a few cells). Timers don't tick and fetch cells have no network inside a live example, so show those with `notation` and say so.
- Every `sx` block that shows results uses `⇒` lines and must pass. Results are written as the language writes values: `5`, `"text"`, `true`, `false`, `nil`, `(list 1 2)`, `{total 5}`. Examples run on 11 October 2026 09:00 UTC. A block with no `⇒` and no `in=` is only shown (not run): use that for fragments that read cells no example defines.
- Link generously but correctly: kinds with `kind:x`, functions with `fn:x`, events `event:x`, ops `op:x`, tools `tool:x`, routes `route:GET /api/…`, style keys `style:x`, formats `format:x`, tokens `token:x`, shortcuts `key:<id>` (ids in `src/web/shortcuts.ts`), templates `template:<id>`, glossary words `term:x` (the ids in glossary.md, e.g. `term:cell`, `term:collection`), other pages `/section/page/` (from the docs root, trailing slash), source files `src:src/core/ops.ts`. Don't link to a page that isn't in `site/nav.ts`.
- Never copy a list that exists in code (all kinds, all functions, all routes…): use `::ref <list>`.

## Check your work

Run, from the repository root (Git Bash or PowerShell):

```
npx tsx site/scripts/check.ts <your page prefixes>
```

It must end with `0 problems`. Links to pages or entries that other writers haven't written yet are reported as "not written yet", which is fine. Doc-test failures are real: either your example is wrong or your understanding is; check the code (`src/core/sx.ts`, `src/core/engine.ts`) and fix the page. You can try an expression quickly with:

```
node --import tsx -e "const {runSx}=await import('./site/build/examples.ts'); console.log(runSx('(sum (list 1 2))\n⇒ 3'))"
```

Don't run `npm run build`, the dev server, or anything that writes outside your files. Don't commit.

## Report back

- The files you wrote, and the entry count per type.
- Claims you could not confirm in the code, if any (better to leave a claim out than guess).
- Pictures or glossary words you needed and didn't have; anything wrong you noticed elsewhere (in code or other docs).
