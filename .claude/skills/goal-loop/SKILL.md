---
name: goal-loop
description: Run a long autonomous build session toward a goal the user states as features plus a definition of DONE. Loops implement → gates → screenshots → read them → fix until every DONE item has evidence, keeps PROGRESS.md as the session's memory, commits and pushes per milestone, and records blockers instead of stopping. Use when the user runs /goal-loop or asks to start, resume or continue a long goal/loop coding session.
argument-hint: "Feature: … Done: …  |  path/to/brief.md  |  resume"
disable-model-invocation: true
---

# Goal loop

The brief for this session:

<brief>
$ARGUMENTS
</brief>

You are going to work until the goal is met, possibly across several context compactions. The protocol
below is the same for every goal; the facts about this repository (commands, URLs, screens, viewports,
where evidence goes) are in [project.md](project.md). Read project.md now, before anything else.

## 0. Read the brief

- **A path to a file** → read the file; it is the brief.
- **`resume`, or empty, and PROGRESS.md has unchecked items** → you are resuming. Read PROGRESS.md and
  `git log --oneline -15`, re-run the gates (step 2), then continue from its **Next** line (step 4).
- **Empty and nothing to resume** → show the user [brief-template.md](brief-template.md) and stop.
- Otherwise the brief is inline text. Find the **Feature(s)** (what to build) and the **Done** (when to stop).
  The brief may use other words or none at all; read for intent.

Words such as *ultrathink*, *think hard* or *polished* attached to part of the brief mean that part gets
real design thought before you write code: list the options, choose one, and write the choice and the
reasons under **Decisions** in PROGRESS.md.

Don't stop to ask questions. Where the brief is silent or ambiguous, choose what a careful senior engineer
on this codebase would choose, and write it under **Decisions** so the user can overrule it later. Stop
and ask only when the decision is irreversible or outward-facing (deleting user data, publishing, spending
money) and the brief doesn't cover it.

## 1. Turn DONE into a contract

The brief's Done is usually a few lines of prose. Rewrite it as a numbered list of acceptance criteria,
each one checkable, each with **how it is verified** and **where the evidence will be**:

| # | criterion | verified by | evidence |
|---|---|---|---|
| D1 | Tables become searchable cards under 600px | sweep at 390×844, plus typing "boston" in search with `cdp.mjs --js` | `docs/showcase/<slug>/phone-table.png` |

Rules for the contract:

- **Always include the standard gates from project.md**: typecheck, every test passing, the production
  build, zero console/network problems across the full screen sweep, and the showcase. They apply even
  when the brief doesn't mention them.
- **Make vague words concrete.** For example:
  - "works end to end": exercised through the running app (UI or API), not only unit tests.
  - "responsive / mobile": phone-size screenshots with no horizontal overflow, no clipped or overlapping
    text, and controls that can be tapped.
  - "polished": consistent spacing and type, plus empty, error and loading states, keyboard access, dark mode.
  - "no errors": the sweep's CONSOLE count is 0.
- **Every feature named in the brief maps to at least one criterion.** Before going on, check for a feature
  with no criterion.
- New logic gets tests. Put "new tests cover X" in the contract where it applies.

Write the contract into PROGRESS.md (step 3). It doesn't change silently afterwards: if you find a
criterion is wrong, edit it and say why in the Log.

## 2. Baseline

Before changing anything, run the gates and a sweep on the code as it is (project.md has the commands).
Record the results in the Log: test count, any failures, any console problems. Anything broken now is
not your regression, but if it stands between you and a contract item, fixing it is part of the goal.

## 3. Plan in PROGRESS.md

- **No PROGRESS.md** → create one from [progress-template.md](progress-template.md).
- **A PROGRESS.md for a different goal** → move it to `docs/progress/<YYYY-MM-DD>-<slug>.md` with `git mv`,
  then start a new one from the template. A finished goal's record is history; keep it.
- **A PROGRESS.md for this goal** → resume it.

Explore the parts of the codebase the goal touches before planning. Use an `Explore` agent for broad
sweeps so the file dumps stay out of your context. Then split the work into **milestones**:

- Each milestone is a vertical slice that can be verified and committed on its own, and leaves the app working.
- Order them so the foundations come first (model, data, API), then the UI built on them, then the
  showcase, and last the **final audit**.
- Every milestone lists the contract items it moves.

## 4. The loop (one milestone at a time)

```
implement → gates → run the app → screenshot → READ every screenshot → fix → repeat
```

1. **Implement** the slice. Match the code around it: naming, comment density, idioms, file layout.
   Write the tests together with the code, not afterwards.
2. **Gates.** Run `scripts/gates.sh` from this skill. Fix whatever fails. Never weaken, skip or delete a test
   to get green; if a test is wrong, fix it and say why in the commit message.
3. **Run the app** on an isolated server with its own data (project.md). Leave the user's dev server and data alone.
4. **Screenshot** the screens this milestone touches, at every viewport project.md lists. Drive real
   interactions (click, type, pick, print) and screenshot the result. A screenshot of the idle page says
   nothing about a feature that only shows after you interact.
5. **Read every screenshot** with the Read tool. Looking at them is the step that catches problems. Check for:
   horizontal overflow and clipped text; overlapping or misaligned elements; inconsistent spacing; empty,
   error and loading states; truncated tables; missing icons or fonts; unreadable dark mode; contrast;
   touch targets under ~40px on phones; leftover debug UI; and anything a picky user would point at.
   Also read every `CONSOLE` line the tools print.
6. **Fix and repeat** until the milestone's contract items pass, with evidence.
7. **Record and commit.** Tick the items in PROGRESS.md, add a Log line (what was done, what was verified,
   test count), set **Next**, then commit and push (see below).

Work in small steps. A dozen short loops are better than one long one where five problems pile up.

## 5. Specialists (subagents)

Spawn agents when the work splits into **independent areas with disjoint files**, or when a deep
sub-problem would flood your context. Keep the number small. The lead (you) owns:

- shared files, PROGRESS.md, commits and pushes;
- the contracts between the parts: types, API shapes, file ownership. Settle these before spawning;
- integration, and **verification**. An agent saying it's done is a claim. Check it yourself with the gates and a sweep.

Each brief must stand on its own: the goal, the exact files the agent owns (and may not go beyond), the
interfaces it must keep, the conventions to follow, the gates it must run, and what to report back
(what changed, what it verified, what is still open). Launch independent agents in one message so they
run in parallel. Before the final audit, have a fresh `feature-dev:code-reviewer` review the goal's
whole diff. Fix what holds up; note what you rejected and why.

## 6. Showcase

Build a showcase that uses **every** new feature together, in a realistic scenario rather than a list of
widgets. Make it reproducible from the repo (project.md says how, e.g. a template), not a one-off left in a
local database. Verify it like everything else: all viewports, interactions, print. The committed evidence
(screenshots, PDFs) goes where project.md says, with a short index that maps each contract item to its files.

## 7. Final audit

When every milestone is ticked, verify again from a clean state, not from memory:

1. A fresh isolated server with **empty** data and a fresh build. Recreate the showcase from the repo.
2. All gates, then the full sweep across every screen and viewport. The CONSOLE count must be 0.
3. Read every evidence image again. Regenerate any that are stale.
4. Go through the contract one item at a time. Mark each **pass** with its evidence path, or **blocked**
   with the reason. Anything else means you aren't done: go back to step 4.
5. Clean up: stop the servers you started, delete scratch files from the repo, and make sure README and
   docs describe the new features.
6. Commit and push the final state.

## Commits and pushes

- Commit after each milestone that passes the gates, plus the final audit. Don't commit a red tree.
- Follow the style of `git log`: a short imperative title, then a bulleted body of what changed for the user.
- Commit on the current branch. Push to its upstream. Never force-push, rewrite published history, or bypass hooks.
- Never commit secrets, `.env` files, local databases or scratch output. Check `git status` before every commit.
- If a push fails (auth, network), write that in the Log and carry on. The commits stay local, and the
  final report says so.

## Never stop early; write blockers down

- Keep going until every contract item is **pass** or **blocked**. "Mostly working" is not a stopping point.
- **Blocked** means you need something only the user can provide: a credential, access to an external
  service, or a decision outside the brief. Write it in PROGRESS.md under **Blocked**: what is blocked,
  why, what you tried, and exactly what would unblock it. Then **continue with everything else**. Where a
  stand-in such as a mock, fixture or offline fallback keeps the rest verifiable, use it and label it.
- A failing test, a bug you can't find yet, or a bad screenshot is **not** a blocker. It is the work.
- Report the truth. If something wasn't verified, say so. Never tick an item without evidence.

## Staying oriented across compaction

PROGRESS.md is the memory that survives a compaction. Keep its **Next** line accurate at all times, and add to
**Notes** as soon as you learn something non-obvious: a gotcha, a flaky test, a constraint. When a
command's output is large, write it to a scratch file and grep it rather than reading it all. Screenshots
taken during the loop go in the scratchpad; only the final evidence goes in the repo.

## Final report

When done, give the user a short report: what shipped, the contract table with pass/blocked and evidence
paths, anything blocked and what it needs, decisions they may want to revisit, and the commits pushed
(or not pushed, and why).
