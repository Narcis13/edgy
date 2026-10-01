# Progress

Goal: <one paragraph: the features, in the user's terms>

Started <YYYY-MM-DD> on branch `<branch>` at `<short sha>`.

**Next:** <the single next action; keep this current, since it is what a resumed session reads first>

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build pass | `gates.sh` | Log | open |
| G2 | Zero console/network problems on every screen at every viewport | `sweep.sh` | Log | open |
| G3 | A showcase exercising every new feature, verified on desktop, phone and print | sweep + reading the images | `docs/showcase/<slug>/` | open |
| D1 | … | … | … | open |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [ ] **<name>**: <what it delivers> (D1, D2)
2. [ ] …
n. [ ] **Final audit**: clean build, empty data, all gates, full sweep, every contract item checked

## Decisions

- <choice made where the brief was silent>: <why>. *(overrule if you disagree)*

## Blocked

- *(none)*. Use the form: **what** · why · what was tried · what would unblock it

## Notes

- <gotchas, constraints, things a resumed session must know>

## Log

- <YYYY-MM-DD>: baseline: <N> tests pass, typecheck <clean/errors>, sweep <0/N> problems.
