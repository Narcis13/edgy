// The order of the docs: three paths, their sections and pages. Previous and
// next follow this order inside a path. Every page in site/content is listed
// here exactly once (a test checks), except the home page and the 404 page.
// Paths are page URLs relative to the docs' root, ending in "/".

export interface Group { label: string }
export interface Section { title: string; pages: (string | Group)[] }
export interface Path { id: 'learn' | 'reference' | 'internals'; title: string; about: string; sections: Section[] }

const g = (label: string): Group => ({ label });

export const NAV: Path[] = [
  {
    id: 'learn',
    title: 'Learn',
    about: 'From nothing to a document that reacts, saves records and is shared, one step at a time.',
    sections: [
      { title: 'Getting started', pages: ['start/install/', 'start/screens/', 'start/first-document/', 'start/views/', 'start/keyboard/'] },
      {
        title: 'Tutorials',
        pages: [
          'tutorials/', 'tutorials/quote/', 'tutorials/checklist/', 'tutorials/wizard/', 'tutorials/order-tracker/', 'tutorials/dashboard/',
          'tutorials/flowchart/', 'tutorials/deck/', 'tutorials/sharing/', 'tutorials/print-export/', 'tutorials/agent/',
        ],
      },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    about: 'Every cell, function, event, setting and route, to look things up.',
    sections: [
      {
        title: 'Cells',
        pages: [
          'cells/',
          g('Layout'), 'cells/row/', 'cells/col/', 'cells/empty/',
          g('Holding other cells'), 'cells/tabs/', 'cells/panel/', 'cells/accordion/', 'cells/collapsible/',
          g('Words and pictures'), 'cells/text/', 'cells/image/', 'cells/icon/', 'cells/break/',
          g('Values'), 'cells/input/', 'cells/formula/', 'cells/data/', 'cells/stat/',
          g('Doing things'), 'cells/button/',
          g('Many things'), 'cells/list/', 'cells/table/', 'cells/calendar/',
          g('Drawing'), 'cells/chart/', 'cells/diagram/', 'cells/canvas/',
          g('Live sources'), 'cells/timer/', 'cells/fetch/',
        ],
      },
      {
        title: 'The editor',
        pages: [
          'editor/', 'editor/cells/', 'editor/slash-menu/', 'editor/panel/', 'editor/formula-bar/', 'editor/code-studio/', 'editor/ask-ai/',
          'editor/activity/', 'editor/links/', 'editor/minimap/', 'editor/undo/', 'editor/page-view/',
        ],
      },
      {
        title: 'The language',
        pages: [
          'language/', 'language/truth/', 'language/names/', 'language/templates/', 'language/formats/', 'language/errors/',
          'language/functions/', 'language/functions/math/', 'language/functions/logic/', 'language/functions/lists/', 'language/functions/records/',
          'language/functions/text/', 'language/functions/dates/', 'language/functions/cells/', 'language/functions/actions/',
        ],
      },
      {
        title: 'Events and actions',
        pages: ['events/', 'events/reference/', 'events/timers/', 'events/fetch/', 'events/custom/', 'events/loops-and-undo/', 'events/who-runs-what/'],
      },
      { title: 'Data', pages: ['data/collections/', 'data/data-page/'] },
      { title: 'Flow', pages: ['flow/', 'flow/timeline/', 'flow/board/', 'flow/tasks-and-calendar/', 'flow/notes/', 'flow/in-documents/', 'flow/agents/'] },
      { title: 'Styling', pages: ['styling/style-keys/', 'styling/theme/'] },
      { title: 'Library', pages: ['library/', 'library/templates/', 'library/decks/', 'library/share-links/', 'library/export/'] },
      { title: 'People', pages: ['people/accounts/', 'people/sharing/', 'people/presence/', 'people/api-keys/', 'people/sync/'] },
      { title: 'Agents', pages: ['agents/', 'agents/mcp/', 'agents/notation/', 'agents/ops/', 'agents/http/'] },
      { title: 'Help', pages: ['glossary/', 'troubleshooting/', 'a-z/'] },
    ],
  },
  {
    id: 'internals',
    title: 'Under the hood',
    about: 'How edgy works, from a keystroke to the other browsers and the cloud log, file by file.',
    sections: [
      {
        title: 'How it works',
        pages: [
          'internals/', 'internals/model/', 'internals/ops/', 'internals/normalize/', 'internals/engine/', 'internals/interpreter/',
          'internals/notation/', 'internals/session/', 'internals/event-stream/', 'internals/storage/', 'internals/runner/',
          'internals/access/', 'internals/sync/', 'internals/export/', 'internals/pagination/', 'internals/compose/',
        ],
      },
      { title: 'Contributing', pages: ['contributing/', 'contributing/gates/', 'contributing/checklists/', 'contributing/docs/'] },
    ],
  },
];

/** Every page in order, with its path and section. */
export function navPages(): { page: string; path: Path; section: Section; group?: string }[] {
  const out: { page: string; path: Path; section: Section; group?: string }[] = [];
  for (const path of NAV) {
    for (const section of path.sections) {
      let group: string | undefined;
      for (const p of section.pages) {
        if (typeof p === 'string') out.push({ page: p, path, section, group });
        else group = p.label;
      }
    }
  }
  return out;
}
