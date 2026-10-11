# Brief for the reviewers of the edgy docs

You are reviewing one section of the documentation site for edgy (this repository; README.md explains the app). Another writer wrote it from reading the code. Your job: **check every claim on every page of your section against the code, and fix each wrong one in place**. Wrong docs are worse than none.

Read first: `site/content/contributing/docs.md` (the page format and the style guide) and `site/content/glossary.md` (the words).

## How to review a page

1. Read the page in full.
2. For every factual claim (what a control is labelled, what a key does, what a prop accepts, what a function returns, what an error says, which file does what, what a route needs, what happens on a phone or on paper), find the code that decides it and confirm it. The pages name the source files; grep `src/` for the rest. UI labels are in the `.tsx` files; messages are quoted exactly from the code.
3. A claim the code contradicts is **wrong**: fix it with the smallest edit that makes it true, in the page's voice (plain, concrete, second person, the UI's exact labels in bold). A claim you can't confirm either way: soften it or remove it, and count it as wrong. A claim that is true but misleading (it omits a case a reader will hit): fix it.
4. Don't rewrite pages for style, don't restructure, don't add sections. Keep entries (`::: fn x` …), examples and their `⇒` results; if a result is wrong the doc-test would already fail, so a wrong *explanation* of an example is what to look for.
5. After your edits, run `npx tsx site/scripts/check.ts <your prefixes>`: it must end with `0 problems` (links to pictures not made yet are fine).

Touch only the pages of your section. Don't edit `src/`, `site/build/`, `site/nav.ts` or other sections; if the code itself looks wrong, or another section is wrong, report it. Don't run the app's dev server or anything that writes outside your files. Don't commit.

## Report back

- Per page: the number of wrong claims found and fixed, with one line per fix (`page: "what it said" → "what it says now", because <file:function>`).
- The totals for your section: pages reviewed, wrong claims found, fixed.
- Anything wrong in the code or elsewhere that you noticed.
