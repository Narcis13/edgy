// A document cut into printed pages: margins, whole cells, page breaks, footers.
// Source: src/web/print/paginate.ts (paginate, keepWithNext, pageSpec),
// src/web/print/Pages.tsx.

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'pagination';
const PAGE_W = 164;
const PAGE_H = 270;
const TOP = 34;
const MARGIN = 20;
const PAGES = [10, 278, 546];

/** A sheet: its edge, the printable area inside the margins, and the footer. */
const Sheet = ({ x, n }: { x: number; n: number }) => (
  <g>
    <Box x={x} y={TOP} w={PAGE_W} h={PAGE_H} label="" />
    <Frame x={x + MARGIN} y={TOP + MARGIN} w={PAGE_W - 2 * MARGIN} h={PAGE_H - 2 * MARGIN} />
    <Label x={x + PAGE_W - MARGIN} y={TOP + PAGE_H - 8} anchor="end">{`Page ${n} of 3`}</Label>
  </g>
);

export function Pagination() {
  const [p1, p2, p3] = PAGES;
  const cx = (p: number) => p + MARGIN + 6;
  const cw = PAGE_W - 2 * MARGIN - 12;
  return (
    <Diagram
      id={ID}
      w={720}
      h={406}
      title="How a document is cut into printed pages"
      desc="Three sheets of paper side by side. Each sheet has a margin on every side, with the printable area drawn as a dashed outline inside it, and a footer in the bottom margin that reads Page 1 of 3, Page 2 of 3 and Page 3 of 3. Page 1 holds a heading, a text cell and a table. The next cell, D, a chart, would not fit in the room left, so rather than cut it, D moves whole to the top of page 2, drawn in the accent colour with an accent arrow. Page 2 holds D, then a text cell, then a page break cell, drawn in amber with a dashed outline, which always ends the page even though there is room left. An amber arrow shows that what follows starts on page 3, which holds a heading, a text cell and a list. The document is laid out once and cut afterwards: a cell is not cut if it can be helped, a page ends low on the sheet between as many whole groups as possible, and a heading stays with the cell after it."
    >
      <Sheet x={p1} n={1} />
      <Sheet x={p2} n={2} />
      <Sheet x={p3} n={3} />

      <Arrow id={ID} both points={[[p1 + 82, TOP], [p1 + 82, TOP + MARGIN]]} label="margin" labelAt={[p1 + 118, TOP + 15]} />

      {/* page 1 */}
      <Box x={cx(p1)} y={60} w={cw} h={26} label="heading" />
      <Box x={cx(p1)} y={92} w={cw} h={40} label="text" />
      <Box x={cx(p1)} y={138} w={cw} h={72} label="table" />
      <Label x={p1 + 82} y={262} anchor="middle">no room left for D</Label>

      {/* D moves whole */}
      <Arrow id={ID} tone="accent" points={[[p1 + 144, 250], [226, 250], [226, 100], [cx(p2), 100]]} />
      <Label x={234} y={172} tone="accent">moves</Label>
      <Label x={234} y={188} tone="accent">whole</Label>

      {/* page 2 */}
      <Box x={cx(p2)} y={60} w={cw} h={80} tone="accent" label="D · chart" sub="moved whole" />
      <Box x={cx(p2)} y={146} w={cw} h={46} label="text" />
      <Box x={cx(p2)} y={202} w={cw} h={26} tone="warn" dashed label="page break" />
      <Label x={p2 + PAGE_W / 2} y={262} anchor="middle" tone="warn">the page ends here</Label>

      {/* the break forces the next page */}
      <Arrow id={ID} tone="warn" points={[[cx(p2) + cw, 215], [494, 215], [494, 73], [cx(p3), 73]]} />
      <Label x={502} y={140} tone="warn">starts</Label>
      <Label x={502} y={156} tone="warn">a page</Label>

      {/* page 3 */}
      <Box x={cx(p3)} y={60} w={cw} h={26} label="heading" />
      <Box x={cx(p3)} y={92} w={cw} h={40} label="text" />
      <Box x={cx(p3)} y={138} w={cw} h={60} label="list" />

      <Label x={10} y={326}>The document is laid out once, then cut. A cell is not cut if it can be helped: D waited for the next page whole.</Label>
      <Label x={10} y={342}>A page ends low on the sheet, between as many whole groups as possible. A heading stays with the cell after it.</Label>
      <Label x={10} y={358}>A page break cell always ends the page. A cell taller than a page is sliced where it must be.</Label>
      <Label x={10} y={374}>The margin is the same on every side: 16 mm unless the document sets another.</Label>
      <Label x={10} y={390}>The footer is nothing, the page number, or the title with the number.</Label>
    </Diagram>
  );
}
