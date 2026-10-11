// A document is a tree of cells. A split turns a leaf into a row (or col) of
// two; a merge turns neighbours into one; normalize keeps the tree tidy.
// Source: src/core/ops.ts (split, merge), src/core/tree.ts (normalize).

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'cell-tree';
const COL_W = 200;
const X = [10, 260, 510];

/** One tree node: a small box. */
const Node = ({ cx, y, label, touched }: { cx: number; y: number; label: string; touched?: boolean }) => (
  <Box x={cx - 22} y={y} w={44} h={26} label={label} tone={touched ? 'accent' : 'ink'} />
);

/** A line from a parent node to a child node. */
const Holds = ({ from, to, y1, y2 }: { from: number; to: number; y1: number; y2: number }) => (
  <Arrow id={ID} points={[[from, y1 + 26], [to, y2]]} />
);

export function CellTree() {
  const [x1, x2, x3] = X;
  const L0 = 250;
  const L1 = 300;
  const L2 = 350;
  return (
    <Diagram
      id={ID}
      w={720}
      h={456}
      title="A split and a merge on the cell tree"
      desc="Three pictures of one document, each drawn twice: as nested boxes and, underneath, as the tree of the same cells. Before: a col holds three cells, a, b and c. After a split of b into a row: b has become a row that holds b and a new empty cell n side by side, and a and c are unchanged. After a merge of b and n: the two siblings are one cell again, b, and the row that held them is gone, so the col holds a, b and c once more. A col never sits directly inside a col, a row never directly inside a row, and a plain row or col with one cell is replaced by that cell. Accent colour marks the cells the op touched: the cell that was split and the cell it made, then the merged cell. Dashed frames are groups; grey boxes are cells nothing touched."
    >
      {/* titles and the op that gets from one picture to the next */}
      <Label x={x1} y={22} tone="ink" size="title">Before</Label>
      <Label x={x2} y={22} tone="ink" size="title">After a split</Label>
      <Label x={x3} y={22} tone="ink" size="title">After a merge</Label>
      <Label x={x2} y={40} mono>{'["split", "b", "row"]'}</Label>
      <Label x={x3} y={40} mono>{'["merge", "b", "n"]'}</Label>

      {/* nested boxes: before */}
      <Frame x={x1} y={50} w={COL_W} h={138} label="col" />
      <Box x={x1 + 12} y={78} w={176} h={30} label="a" />
      <Box x={x1 + 12} y={114} w={176} h={30} label="b" />
      <Box x={x1 + 12} y={150} w={176} h={30} label="c" />

      {/* nested boxes: after the split */}
      <Frame x={x2} y={50} w={COL_W} h={170} label="col" />
      <Box x={x2 + 12} y={78} w={176} h={30} label="a" />
      <Frame x={x2 + 12} y={114} w={176} h={62} label="row" />
      <Box x={x2 + 19} y={138} w={78} h={30} label="b" tone="accent" />
      <Box x={x2 + 103} y={138} w={78} h={30} label="n" tone="accent" />
      <Box x={x2 + 12} y={182} w={176} h={30} label="c" />

      {/* nested boxes: after the merge */}
      <Frame x={x3} y={50} w={COL_W} h={138} label="col" />
      <Box x={x3 + 12} y={78} w={176} h={30} label="a" />
      <Box x={x3 + 12} y={114} w={176} h={30} label="b" tone="accent" />
      <Box x={x3 + 12} y={150} w={176} h={30} label="c" />

      <Arrow id={ID} points={[[x1 + COL_W + 5, 120], [x2 - 5, 120]]} label="split" />
      <Arrow id={ID} points={[[x2 + COL_W + 5, 120], [x3 - 5, 120]]} label="merge" />

      {/* the trees */}
      {X.map((x) => <Label key={x} x={x} y={243}>as a tree</Label>)}

      <Node cx={x1 + 100} y={L0 + 10} label="col" />
      <Holds from={x1 + 100} to={x1 + 30} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x1 + 100} to={x1 + 100} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x1 + 100} to={x1 + 170} y1={L0 + 10} y2={L1 + 10} />
      <Node cx={x1 + 30} y={L1 + 10} label="a" />
      <Node cx={x1 + 100} y={L1 + 10} label="b" />
      <Node cx={x1 + 170} y={L1 + 10} label="c" />

      <Node cx={x2 + 100} y={L0 + 10} label="col" />
      <Holds from={x2 + 100} to={x2 + 30} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x2 + 100} to={x2 + 100} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x2 + 100} to={x2 + 170} y1={L0 + 10} y2={L1 + 10} />
      <Node cx={x2 + 30} y={L1 + 10} label="a" />
      <Node cx={x2 + 100} y={L1 + 10} label="row" />
      <Node cx={x2 + 170} y={L1 + 10} label="c" />
      <Holds from={x2 + 100} to={x2 + 65} y1={L1 + 10} y2={L2 + 10} />
      <Holds from={x2 + 100} to={x2 + 135} y1={L1 + 10} y2={L2 + 10} />
      <Node cx={x2 + 65} y={L2 + 10} label="b" touched />
      <Node cx={x2 + 135} y={L2 + 10} label="n" touched />

      <Node cx={x3 + 100} y={L0 + 10} label="col" />
      <Holds from={x3 + 100} to={x3 + 30} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x3 + 100} to={x3 + 100} y1={L0 + 10} y2={L1 + 10} />
      <Holds from={x3 + 100} to={x3 + 170} y1={L0 + 10} y2={L1 + 10} />
      <Node cx={x3 + 30} y={L1 + 10} label="a" />
      <Node cx={x3 + 100} y={L1 + 10} label="b" touched />
      <Node cx={x3 + 170} y={L1 + 10} label="c" />

      {/* what normalize keeps true */}
      <Label x={10} y={410}>{'Split b as a row: b’s parent is a col, so b becomes a row that holds b and the new cell n, half and half.'}</Label>
      <Label x={10} y={426}>{'Split b as a col instead: the parent is already a col, so n joins it beside b. A col never sits in a col.'}</Label>
      <Label x={10} y={442}>{'Merge b and n: the two siblings become one cell, and a row left with one cell is replaced by it.'}</Label>
    </Diagram>
  );
}
