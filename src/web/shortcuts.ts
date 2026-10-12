// Every keyboard shortcut edgy answers, in one list: what the docs show and the
// README's table follow it. The handlers live next to what they drive
// (editor/Editor.tsx useKeyboard, code/Studio.tsx, code/CodeEditor.tsx,
// play/Play.tsx, the kinds); a key added there belongs here too.
//
// Keys are written the Mac way, with Mod for ⌘ on a Mac and Ctrl elsewhere.

import { TOOLS as DIAGRAM_TOOLS } from './kinds/diagram-tools';

export type ShortcutPlace = 'editor' | 'cell' | 'code' | 'studio' | 'play' | 'diagram' | 'list' | 'calendar' | 'tabs' | 'table' | 'library' | 'flow';

export interface Shortcut {
  /** Stable, for links: `#key-<id>` in the docs. */
  id: string;
  /** One or more alternatives, each a chord such as "Mod+Shift+Z" or "Alt+Arrow". */
  keys: string[];
  where: ShortcutPlace;
  does: string;
}

/** Where each group of shortcuts works, in the docs' words. */
export const SHORTCUT_PLACES: Record<ShortcutPlace, string> = {
  editor: 'In Edit, with a cell selected',
  cell: 'While typing in a cell',
  code: 'In a code field',
  studio: 'In the code studio',
  diagram: 'In a diagram you are editing',
  list: 'In a list',
  calendar: 'In a calendar',
  tabs: 'In tabs',
  table: 'In a table',
  play: 'Playing a deck',
  library: 'In the library',
  flow: 'In Flow',
};

export const SHORTCUTS: Shortcut[] = [
  { id: 'move', keys: ['Arrow'], where: 'editor', does: 'Select the nearest cell in that direction; with Shift, add it to the selection.' },
  { id: 'split', keys: ['Alt+Arrow'], where: 'editor', does: 'Split the selected cell in that direction; the new, empty cell is on that side.' },
  { id: 'next-cell', keys: ['Tab', 'Shift+Tab'], where: 'editor', does: 'Select the next or the previous cell.' },
  { id: 'edit', keys: ['Enter'], where: 'editor', does: 'Edit a text, empty, formula or button cell; on a group, select its first cell.' },
  { id: 'type', keys: ['any character'], where: 'editor', does: 'In an empty cell, start typing its text with that character (= starts a formula).' },
  { id: 'parent', keys: ['Esc'], where: 'editor', does: 'Close the / menu; otherwise select the cell around the selected one.' },
  { id: 'kind-menu', keys: ['/'], where: 'editor', does: 'Open the / menu to choose what the cell holds.' },
  { id: 'clear', keys: ['Backspace', 'Delete'], where: 'editor', does: 'Clear the cell; on a cell that is already empty, remove it.' },
  { id: 'duplicate', keys: ['Mod+D'], where: 'editor', does: 'Duplicate the selected cell after itself.' },
  { id: 'merge', keys: ['Mod+M'], where: 'editor', does: 'Merge the selected cells into one.' },
  { id: 'undo', keys: ['Mod+Z'], where: 'editor', does: 'Undo the last change (also in Live).' },
  { id: 'redo', keys: ['Mod+Shift+Z'], where: 'editor', does: 'Redo what was undone.' },
  { id: 'print', keys: ['Mod+P'], where: 'editor', does: 'Print the document as pages (works in every view).' },
  { id: 'studio', keys: ['Mod+E'], where: 'editor', does: 'Open the code studio for the selected cell, or its events when it holds no code.' },

  { id: 'cell-done', keys: ['Esc', 'Mod+Enter'], where: 'cell', does: 'Finish typing in the cell.' },
  { id: 'cell-next', keys: ['Tab', 'Shift+Tab'], where: 'cell', does: 'Finish and select the next or the previous cell.' },
  { id: 'cell-formula', keys: ['Enter'], where: 'cell', does: 'In an empty cell whose text starts with =, finish: the cell becomes a formula.' },

  { id: 'complete', keys: ['Ctrl+Space'], where: 'code', does: 'Show the suggestions for the word at the cursor.' },
  { id: 'complete-move', keys: ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'], where: 'code', does: 'Move through the suggestions.' },
  { id: 'complete-accept', keys: ['Enter', 'Tab'], where: 'code', does: 'Take the highlighted suggestion.' },
  { id: 'complete-close', keys: ['Esc'], where: 'code', does: 'Close the suggestions.' },
  { id: 'code-apply', keys: ['Mod+Enter'], where: 'code', does: 'Apply the code.' },
  { id: 'indent', keys: ['Tab', 'Shift+Tab'], where: 'code', does: 'Indent or outdent the selected lines.' },
  { id: 'pairs', keys: ['(', '{', '"'], where: 'code', does: 'Type the closing bracket or quote too; typing it again steps over it, and Backspace removes the pair.' },
  { id: 'expand', keys: ['Mod+E'], where: 'code', does: 'Open the same code in the code studio.' },

  { id: 'studio-apply', keys: ['Mod+Enter'], where: 'studio', does: 'Apply the code and close the studio.' },
  { id: 'studio-close', keys: ['Esc'], where: 'studio', does: 'Close the studio (it asks first when there are changes).' },

  ...DIAGRAM_TOOLS.map((t) => ({ id: `diagram-${t.tool}`, keys: [t.key.toUpperCase()], where: 'diagram' as const, does: `Pick the ${t.name.toLowerCase()} tool.` })),
  { id: 'diagram-nudge', keys: ['Arrow', 'Shift+Arrow'], where: 'diagram', does: 'Move the picked elements by 1, or by 10 with Shift.' },
  { id: 'diagram-delete', keys: ['Backspace', 'Delete'], where: 'diagram', does: 'Delete the picked elements.' },
  { id: 'diagram-duplicate', keys: ['Mod+D'], where: 'diagram', does: 'Duplicate the picked elements.' },
  { id: 'diagram-all', keys: ['Mod+A'], where: 'diagram', does: 'Pick every element.' },
  { id: 'diagram-label', keys: ['Enter'], where: 'diagram', does: 'Write the text of the picked element; Enter again (or Esc, or Tab) finishes, Shift+Enter starts a new line.' },
  { id: 'diagram-escape', keys: ['Esc'], where: 'diagram', does: 'Close the colours, then go back to the select tool, then let go of what is picked.' },

  { id: 'list-next', keys: ['Enter'], where: 'list', does: 'Keep the item and start the next one.' },
  { id: 'list-cancel', keys: ['Esc'], where: 'list', does: 'Stop editing the item without keeping the change.' },
  { id: 'list-remove', keys: ['Backspace'], where: 'list', does: 'In an empty item, remove it and edit the one before.' },
  { id: 'list-reorder', keys: ['ArrowUp', 'ArrowDown'], where: 'list', does: 'On an item’s grip, move the item up or down.' },

  { id: 'calendar-day', keys: ['Arrow'], where: 'calendar', does: 'Move a day left or right, a week up or down.' },
  { id: 'calendar-month', keys: ['PageUp', 'PageDown'], where: 'calendar', does: 'Move a month back or forward.' },
  { id: 'calendar-week', keys: ['Home', 'End'], where: 'calendar', does: 'Go to the start or the end of the week.' },

  { id: 'tabs-move', keys: ['ArrowLeft', 'ArrowRight', 'Home', 'End'], where: 'tabs', does: 'Go to the tab before or after, or the first or the last.' },
  { id: 'tabs-rename', keys: ['Enter', 'Esc'], where: 'tabs', does: 'Keep or drop a new title while renaming a tab or a section.' },

  { id: 'table-search', keys: ['Esc'], where: 'table', does: 'Clear the table’s search.' },
  { id: 'table-resize', keys: ['ArrowLeft', 'ArrowRight'], where: 'table', does: 'On a column’s resize handle: make the column 16 pixels narrower or wider.' },
  { id: 'table-edit', keys: ['Enter', 'Tab', 'Esc'], where: 'table', does: 'While editing a table cell: Enter keeps it and goes down to the same column of the next row, Tab (Shift+Tab) keeps it and goes across, Esc drops the change.' },

  { id: 'play-next', keys: ['ArrowRight', 'PageDown'], where: 'play', does: 'Next slide (Page Down first scrolls a long slide).' },
  { id: 'play-previous', keys: ['ArrowLeft', 'PageUp'], where: 'play', does: 'Previous slide (Page Up first scrolls a long slide).' },
  { id: 'play-scroll', keys: ['ArrowDown', 'ArrowUp', 'Space', 'Shift+Space'], where: 'play', does: 'Scroll a long slide; Space at the bottom goes to the next slide.' },
  { id: 'play-ends', keys: ['Home', 'End'], where: 'play', does: 'The first or the last slide.' },
  { id: 'play-full', keys: ['F'], where: 'play', does: 'Full screen on or off.' },
  { id: 'play-leave', keys: ['Esc'], where: 'play', does: 'Leave the deck.' },

  { id: 'library-search', keys: ['Esc'], where: 'library', does: 'Clear the search.' },
  { id: 'flow-views', keys: ['1', '2', '3', '4', '5'], where: 'flow', does: 'Open the timeline, the board, the tasks, the calendar or the notes.' },
  { id: 'flow-new', keys: ['N'], where: 'flow', does: 'Write: jump to the composer on the timeline; elsewhere, open the editor for a new item.' },
  { id: 'flow-post', keys: ['Mod+Enter'], where: 'flow', does: 'In the composer, post what you wrote.' },
  { id: 'flow-search', keys: ['/'], where: 'flow', does: 'Jump to the search box; Esc clears it.' },
  { id: 'flow-comment', keys: ['Enter', 'Shift+Enter'], where: 'flow', does: 'In a comment box, send the comment; with Shift, start a new line.' },
  { id: 'flow-move', keys: ['Shift+Arrow'], where: 'flow', does: 'On the board, with a card focused, move it one column left or right.' },
  { id: 'library-describe', keys: ['Enter', 'Esc'], where: 'library', does: 'While writing a card’s description: Enter keeps it (Shift+Enter starts a new line), Esc drops the change.' },
];
