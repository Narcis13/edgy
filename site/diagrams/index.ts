// Every diagram a page can show with ::diagram <name>.

import type { FC } from 'react';
import { AccessModel } from './access-model';
import { CellTree } from './cell-tree';
import { EvalGraph } from './eval-graph';
import { EventDispatch } from './event-dispatch';
import { OpLife } from './op-life';
import { Pagination } from './pagination';
import { SyncLogs } from './sync-logs';

export const DIAGRAMS: Record<string, FC> = {
  'cell-tree': CellTree,
  'op-life': OpLife,
  'event-dispatch': EventDispatch,
  'sync-logs': SyncLogs,
  'access-model': AccessModel,
  'eval-graph': EvalGraph,
  pagination: Pagination,
};
