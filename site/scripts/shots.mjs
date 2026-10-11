// Every screenshot and clip the docs show, by name. Pages use them with
// ::shot <name> "Caption" and ::clip <name> "Caption"; site/scripts/shoot.mjs
// makes each one from a fresh server, in light and dark, and writes the numbered
// marks it measured into site/shots/shots.json.
//
// `alt` is the picture's text for screen readers: what it shows, not what it is for.
// `marks` are the numbered pins on the picture: a CSS selector on the page and what the legend says.

export const KIND_DESIGNERS = [
  'row', 'col', 'empty', 'tabs', 'panel', 'accordion', 'collapsible', 'text', 'image', 'icon', 'break', 'input', 'formula', 'data', 'stat',
  'button', 'list', 'table', 'calendar', 'chart', 'diagram', 'canvas', 'timer', 'fetch',
];

export const TUTORIALS = ['quote', 'checklist', 'wizard', 'order-tracker', 'dashboard', 'flowchart', 'deck', 'sharing', 'print-export', 'agent'];

/** @type {{ name: string; alt: string; about: string }[]} */
export const SHOTS = [
  { name: 'library', alt: 'The library: pinned documents first, then the rest as cards with a small map of each document, a search box and filters above them.', about: 'The home page with a few documents, one pinned, one in a deck.' },
  { name: 'library-search', alt: 'The library filtered by a search for "quote": the matching cards, with the words that matched shown under each.', about: 'Searching the library.' },
  { name: 'data', alt: 'The Data page: a list of collections on the left and the records of the selected one as a table.', about: 'The Data page with a collection of saved quotes.' },
  { name: 'profile', alt: 'The profile page: name, avatar colour, email, password, theme and API keys.', about: 'Profile, signed in.' },
  { name: 'api-keys', alt: 'The API keys section of the profile with one key listed by name and the date it was made.', about: 'Profile → API keys.' },
  { name: 'signin', alt: 'The sign-in page: email, password and a Sign in button.', about: 'Signing in to an edgy that asks for accounts.' },
  { name: 'editor-edit', alt: 'A document in Edit: the header with Edit, Live and Page, the document with one cell selected, and the panel on the right.', about: 'The editor in Edit, a cell selected, Cell details open.' },
  { name: 'editor-live', alt: 'The same document in Live: inputs, formulas and buttons ready to use, no editing handles.', about: 'The editor in Live.' },
  { name: 'editor-page', alt: 'The same document in Page view: printed pages with margins, a footer with page numbers, and the page setup.', about: 'The Page view.' },
  { name: 'editor-phone', alt: 'A document in Live on a phone: the cells stacked in one column and a short header with the More button.', about: 'Live on a 390-pixel-wide phone.' },
  { name: 'more-menu', alt: 'The More menu open on a phone: Activity and messages, Cell details, Show links between cells, Share, Print, Docs, theme and Profile.', about: 'The phone header’s More menu.' },
  { name: 'split', alt: 'A selected cell with a plus button in the middle of each edge, ready to split it in that direction.', about: 'Splitting a cell: the + on each edge.' },
  { name: 'slash-menu', alt: 'The / menu open under an empty cell: a search field above one scrolling list of what a cell can hold, each choice with a short hint.', about: 'Choosing what a cell holds: one flat list you can search, not groups.' },
  { name: 'panel', alt: 'Cell details for a selected formula: its name, what it is, its content, text, spacing, box and events sections.', about: 'The right-hand panel, section by section.' },
  { name: 'formula-bar', alt: 'The formula bar above the document, showing the selected cell’s expression with its colours.', about: 'The formula bar.' },
  { name: 'code-studio', alt: 'The code studio: the expression in a large editor, its live result, the list of functions and the cells you can use.', about: 'The code studio, Code tab.' },
  { name: 'blocks', alt: 'The code studio’s Blocks tab: the same expression as nested blocks you can click together.', about: 'Blocks.' },
  { name: 'ask-ai', alt: 'The code studio’s Ask AI tab: a sentence typed in, the code it became, and an explanation.', about: 'Ask AI.' },
  { name: 'events-section', alt: 'The Events section of Cell details for a checkbox: its change handler written as an expression.', about: 'Giving a cell a handler.' },
  { name: 'activity', alt: 'The Activity panel: each change as an s-expression with who made it and when, people and agents alike.', about: 'Activity and messages.' },
  { name: 'links', alt: 'Lines drawn between a formula and the cells it reads and the cells that read it.', about: 'Show links between cells.' },
  { name: 'page-setup', alt: 'Page setup in the panel: paper size, orientation, margins and footer.', about: 'Page setup for printing.' },
  { name: 'share-dialog', alt: 'The Share dialog: people with access and their roles, and links anyone can open.', about: 'Sharing a document.' },
  { name: 'deck', alt: 'A deck’s page: its documents in order as small maps, with Play.', about: 'A deck.' },
  { name: 'play', alt: 'A deck playing: one slide filling the screen, with its number and the controls to move between slides.', about: 'Play.' },
  { name: 'presence', alt: 'Two people in one document: their avatars in the header and a coloured outline on the cell each has selected.', about: 'Presence.' },
  ...KIND_DESIGNERS.map((k) => ({ name: `designer-${k}`, alt: `Cell details for a ${k} cell: the controls that design it.`, about: `The designer for ${k}.` })),
  ...TUTORIALS.map((t) => ({ name: `tutorial-${t}`, alt: `The finished document of the ${t} tutorial, in Live.`, about: `The last picture of the ${t} tutorial.` })),
];

/** @type {{ name: string; about: string }[]} */
export const CLIPS = [
  { name: 'split', about: 'Splitting a cell with the + on its edges, twice, and choosing what the new cells hold.' },
  { name: 'arrow', about: 'Drawing two boxes in a diagram and an arrow from one to the other.' },
  { name: 'play', about: 'Playing a deck: the first slide, then the next, then leaving.' },
];
