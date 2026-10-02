// What can be done to the selected documents and decks at once.

import { Archive, ArchiveRestore, Layers, Pin, PinOff, Trash2, X } from 'lucide-react';
import type { LibraryEntry } from '../../lib/api';
import { plural } from './text';

export function SelectionBar({ chosen, archived, onPin, onArchive, onDelete, onGroup, onClear }: {
  chosen: LibraryEntry[];
  /** Under the Archived filter: Restore instead of Archive, and no Pin. */
  archived: boolean;
  onPin: (on: boolean) => void;
  onArchive: (on: boolean) => void;
  onDelete: () => void;
  onGroup: () => void;
  onClear: () => void;
}) {
  const docs = chosen.filter((e) => e.type === 'doc').length;
  const decks = chosen.length - docs;
  const allPinned = chosen.every((e) => e.pinned != null);
  const canGroup = docs >= 2 && decks === 0;
  return (
    <div className="lib-selbar" role="region" aria-label="Selection">
      <span className="lib-selcount" aria-live="polite">{plural(chosen.length, 'selected', 'selected')}</span>
      <div className="lib-selactions">
        {!archived && (
          <button type="button" className="btn small" onClick={() => onPin(!allPinned)}>
            {allPinned ? <PinOff size={15} /> : <Pin size={15} />}<span>{allPinned ? 'Unpin' : 'Pin'}</span>
          </button>
        )}
        <button type="button" className="btn small" onClick={() => onArchive(!archived)}>
          {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}<span>{archived ? 'Restore' : 'Archive'}</span>
        </button>
        <button type="button" className="btn small is-danger" onClick={onDelete}>
          <Trash2 size={15} /><span>Delete</span>
        </button>
        {!archived && (
          <button
            type="button"
            className="btn small"
            disabled={!canGroup}
            title={canGroup ? 'Group into a deck' : decks ? 'Decks can not go inside a deck' : 'Select two or more documents'}
            onClick={onGroup}
          >
            <Layers size={15} /><span className="long">Group into a deck</span><span className="short">Group</span>
          </button>
        )}
      </div>
      <button type="button" className="btn small ghost lib-selclear" title="Clear the selection (Esc)" onClick={onClear}><X size={15} /><span>Clear</span></button>
    </div>
  );
}
