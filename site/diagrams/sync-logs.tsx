// Two machines' op logs and the one cloud log: push, pull, replay.
// Source: src/server/sync.ts (once, push, pull, applyOps), src/server/cloud.ts.

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'sync-logs';
const COLS = [250, 430, 610];
const CHIP_W = 150;
const ROWS = { m1: 30, cloud: 150, m2: 270 };
const CHIP_H = 40;

/** What a row is, at its left edge. */
const RowName = ({ y, name, sub }: { y: number; name: string; sub: string }) => (
  <g>
    <Label x={22} y={y + 17} tone="ink" size="label">{name}</Label>
    <Label x={22} y={y + 34}>{sub}</Label>
  </g>
);

export function SyncLogs() {
  const [c1, c2, c3] = COLS;
  const chip = (cx: number) => cx - CHIP_W / 2;
  const { m1, cloud, m2 } = ROWS;
  return (
    <Diagram
      id={ID}
      w={720}
      h={410}
      title="Two machines and the cloud log: push, pull and replay"
      desc="Three rows of operations, each row a log read left to right. The top row is machine 1's local op log, the middle row is the one log in the cloud, and the bottom row is machine 2's local op log. Machine 2 made op X; machine 1 made ops A and B while the two were not talking. Step 1, push: machine 2 sends X, which the cloud files first, as number 1. Step 2, pull: machine 1 asks for everything after the last number it saw and gets X. It puts the cloud's op first and replays its own ops that the cloud has not confirmed, A and B, after it, drawn with dashed amber outlines because they are not confirmed yet. Step 3, push: machine 1 sends A and B, which the cloud files as 2 and 3. Step 4, pull: machine 2 pulls A and B. At the end every machine has the same ops in the same order, X, A, B. Green outlines mark ops that have a place in the cloud's order, which is the truth; the amber dashed outline marks a local op the cloud does not have yet."
    >
      <Frame x={10} y={m1 - 10} w={700} h={CHIP_H + 20} />
      <Frame x={10} y={cloud - 10} w={700} h={CHIP_H + 20} />
      <Frame x={10} y={m2 - 10} w={700} h={CHIP_H + 20} />

      <RowName y={m1} name="Machine 1" sub="made A and B first" />
      <Box x={chip(c1)} y={m1} w={CHIP_W} h={CHIP_H} tone="live" label="X" sub="pulled, number 1" />
      <Box x={chip(c2)} y={m1} w={CHIP_W} h={CHIP_H} tone="warn" dashed label="A" sub="not confirmed yet" />
      <Box x={chip(c3)} y={m1} w={CHIP_W} h={CHIP_H} tone="warn" dashed label="B" sub="not confirmed yet" />

      <RowName y={cloud} name="The cloud" sub="one log, one order" />
      <Box x={chip(c1)} y={cloud} w={CHIP_W} h={CHIP_H} tone="live" label="1 · X" sub="from machine 2" />
      <Box x={chip(c2)} y={cloud} w={CHIP_W} h={CHIP_H} tone="live" label="2 · A" sub="from machine 1" />
      <Box x={chip(c3)} y={cloud} w={CHIP_W} h={CHIP_H} tone="live" label="3 · B" sub="from machine 1" />

      <RowName y={m2} name="Machine 2" sub="made X first" />
      <Box x={chip(c1)} y={m2} w={CHIP_W} h={CHIP_H} tone="live" label="X" sub="its own, confirmed" />
      <Box x={chip(c2)} y={m2} w={CHIP_W} h={CHIP_H} tone="live" label="A" sub="pulled, number 2" />
      <Box x={chip(c3)} y={m2} w={CHIP_W} h={CHIP_H} tone="live" label="B" sub="pulled, number 3" />

      {/* X goes up: pushed by machine 2, pulled by machine 1 */}
      <Arrow id={ID} points={[[c1, m2 - 12], [c1, cloud + CHIP_H + 12]]} />
      <Label x={c1 - 8} y={234} anchor="end">1 push</Label>
      <Arrow id={ID} points={[[c1, cloud - 12], [c1, m1 + CHIP_H + 12]]} />
      <Label x={c1 - 8} y={114} anchor="end">2 pull</Label>

      {/* A and B go down: pushed by machine 1, pulled by machine 2 */}
      {[c2, c3].map((cx) => (
        <g key={cx}>
          <Arrow id={ID} points={[[cx, m1 + CHIP_H + 12], [cx, cloud - 12]]} />
          <Label x={cx + 8} y={114}>3 push</Label>
          <Arrow id={ID} points={[[cx, cloud + CHIP_H + 12], [cx, m2 - 12]]} />
          <Label x={cx + 8} y={234}>4 pull</Label>
        </g>
      ))}

      <Label x={10} y={346}>push: the ops the cloud lacks go up, each with its own id, so sending twice never duplicates.</Label>
      <Label x={10} y={362}>pull: everything after the last number this machine saw, in the cloud's order.</Label>
      <Label x={10} y={378}>replay: the cloud's ops first, then this machine's ops that are not confirmed yet, on top of them.</Label>
      <Label x={10} y={394}>An op that no longer applies stays in the log as a conflict and changes nothing, on every machine.</Label>
    </Diagram>
  );
}
