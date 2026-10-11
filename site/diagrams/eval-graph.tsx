// Cells that read cells: the graph the engine follows, in dependency order.
// Source: src/core/engine.ts (Evaluator.valueOf, read, evaluate: reads and feeds).

import { Arrow, Box, Diagram, Label } from './kit';

const ID = 'eval-graph';
const W = 120;
const H = 46;

const ORDER = ['qty', 'price', 'subtotal', 'discount', 'total'];

export function EvalGraph() {
  return (
    <Diagram
      id={ID}
      w={720}
      h={394}
      title="How a change to qty reaches the cells that read it"
      desc="A small document with five cells. qty and price are typed in. subtotal is qty times price. discount is ten percent off when the subtotal is above 100. total is subtotal minus discount. An arrow runs from a cell to each cell that reads it: qty and price into subtotal; subtotal into discount and into total; discount into total. When qty changes from 4 to 5, the new value flows along the arrows: subtotal goes from 100 to 125, discount from 0 to 12.5, and total from 100 to 112.5. Accent colour marks the cell that was edited and every cell the change reaches, with the arrows it travels along. price is not downstream of qty, so it keeps 25 and is drawn plainly. Underneath, the order the engine works the cells out in: qty, price, subtotal, discount, total, always after the cells each one reads."
    >
      <Label x={10} y={22}>An arrow runs from a cell to a cell that reads it. qty goes from 4 to 5; price stays 25.</Label>

      <Box x={10} y={50} w={W} h={H} tone="accent" label="qty" sub={'4 → 5'} />
      <Box x={10} y={170} w={W} h={H} label="price" sub="25" />
      <Box x={205} y={110} w={W} h={H} tone="accent" label="subtotal" sub={'100 → 125'} />
      <Box x={400} y={50} w={W} h={H} tone="accent" label="discount" sub={'0 → 12.5'} />
      <Box x={590} y={110} w={W} h={H} tone="accent" label="total" sub={'100 → 112.5'} />

      <Label x={70} y={112} anchor="middle">typed in</Label>
      <Label x={70} y={232} anchor="middle">typed in</Label>
      <Label x={265} y={174} anchor="middle">qty × price</Label>
      <Label x={460} y={112} anchor="middle">10% off above 100</Label>
      <Label x={650} y={174} anchor="middle">subtotal − discount</Label>

      <Arrow id={ID} tone="accent" points={[[130, 80], [205, 122]]} />
      <Arrow id={ID} points={[[130, 186], [205, 144]]} />
      <Arrow id={ID} tone="accent" points={[[325, 122], [400, 82]]} />
      <Arrow id={ID} tone="accent" points={[[520, 82], [590, 122]]} />
      <Arrow id={ID} tone="accent" points={[[325, 144], [590, 144]]} />

      <Label x={10} y={262} tone="ink" size="label">The order they are worked out in</Label>
      {ORDER.map((name, i) => (
        <g key={name}>
          <Box x={10 + i * 149} y={272} w={104} h={30} label={`${i + 1}  ${name}`} />
          {i > 0 && <Arrow id={ID} points={[[10 + i * 149 - 45, 287], [10 + i * 149, 287]]} />}
        </g>
      ))}

      <Label x={10} y={330}>A formula runs when evaluate reaches it. Reading another cell works that cell out first, once, and remembers it.</Label>
      <Label x={10} y={346}>So a cell always comes after the cells it reads. A cell that reads itself, through others, is a circular reference.</Label>
      <Label x={10} y={362}>Every change evaluates the whole document again; cells that come out the same are kept as they were.</Label>
      <Label x={10} y={378}>feeds is reads turned round: for each cell, the cells that read it. The editor uses it to draw links.</Label>
    </Diagram>
  );
}
