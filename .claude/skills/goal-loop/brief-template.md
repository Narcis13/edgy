# Brief for /goal-loop

Pass the brief inline, or save it as a file and pass its path:

```
/goal-loop Feature: … Done: …
/goal-loop docs/briefs/offline-sync.md
/goal-loop resume
```

## Format

```markdown
Feature: <what to build, in your own words. Several features are fine; one per paragraph or bullet.
Mark the parts that need deep design with "ultrathink".>

Done means ALL of:
- <an outcome you can check, e.g. "a customer can export a document as .xlsx and open it in Numbers">
- <another one>

Constraints (optional): <things not to touch, dependencies to avoid, deadlines, a branch to use>
```

You don't have to restate the standard gates. Every goal also has to meet these:

- typecheck, all tests and the production build pass, and new logic has tests
- no console or network errors on any screen, at desktop and phone size
- a showcase document that uses every new feature, verified with screenshots on desktop, phone and print,
  with the evidence committed under `docs/showcase/<slug>/`
- PROGRESS.md kept current; a commit and push after each milestone; blockers written down instead of stopping

## Example (the brief that built the code studio)

```markdown
Feature: The code part (the Lisp dialect used internally) deserves a polished editing UI for beginners,
and a way for an AI agent to turn natural language into valid code in the context of the document.
Add more content types for cells (lists, calendar, canvas, whatever adds value), make every content type
work well on phones, and render tables as searchable cards per row on narrow screens. Ultrathink a printing
surface for the document in standard page formats such as A4 portrait and landscape.

Done means ALL of:
- the features above work end to end
- a showcase document demonstrates every one of them, with no glitches or errors
```
