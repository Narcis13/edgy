// What every kind's designer gets.

import type { CellState } from '../../../../core/engine';
import type { Edit } from '../edit';

export interface KindProps {
  e: Edit;
  /** The cell's computed state: its value, error and resolved props. */
  st: CellState | undefined;
}
