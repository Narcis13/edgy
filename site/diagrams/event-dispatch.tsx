// How an event reaches handlers, and how handlers set off more events.
// Source: src/core/events.ts (react, listeners, changes, MAX_DEPTH, MAX_RUNS).

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'event-dispatch';

export function EventDispatch() {
  return (
    <Diagram
      id={ID}
      w={720}
      h={364}
      title="How an event runs handlers, and what stops a loop"
      desc="A row of five steps, left to right. An event, such as a click or a value changing, goes into the queue, which is first in, first out. For each event the listeners are looked up: the cell's own handler for a cell's event, every cell and then the document for a custom event, the document's own for open and close. Each handler runs its action. An action gives two kinds of result: effects, such as saving a record or fetching, which are handed back to whoever called and are shown in green because they leave the loop; and ops, which are applied to the document. After ops are applied, the values before and after are compared, and each value that changed raises a change event for any cell that listens to it. An emit in an action raises a custom event. Both go back into the queue one depth deeper, drawn with accent arrows because accent means an event. The event that started things is depth 0. A loop guard, in amber, stops everything when an event would be 8 deep or after 64 handlers have run: what already ran is kept and the trace says why."
    >
      {/* the pipeline */}
      <Box x={10} y={44} w={110} h={50} tone="accent" label="Event" sub="click, change, …" />
      <Box x={150} y={44} w={120} h={50} label="Queue" sub="oldest first" />
      <Box x={300} y={44} w={110} h={50} label="Listeners" sub="who hears it" />
      <Box x={440} y={44} w={130} h={50} label="Handler" sub="runs its action" />
      <Box x={600} y={44} w={110} h={50} tone="live" label="Effects" sub="records, fetches" />
      <Arrow id={ID} points={[[120, 69], [150, 69]]} />
      <Arrow id={ID} points={[[270, 69], [300, 69]]} />
      <Arrow id={ID} points={[[410, 69], [440, 69]]} />
      <Arrow id={ID} points={[[570, 69], [600, 69]]} />
      <Label x={655} y={112} anchor="middle">carried out by</Label>
      <Label x={655} y={128} anchor="middle">the caller</Label>

      {/* ops and the changes they make */}
      <Box x={440} y={130} w={130} h={50} label="Ops applied" sub="document moves on" />
      <Box x={270} y={130} w={140} h={50} label="Changed values" sub="before vs after" />
      <Arrow id={ID} points={[[505, 94], [505, 130]]} />
      <Arrow id={ID} points={[[440, 155], [410, 155]]} />

      {/* back into the queue, one deeper */}
      <Arrow id={ID} tone="accent" points={[[270, 155], [240, 155], [240, 94]]} />
      <Label x={248} y={118} tone="accent">change events, depth + 1</Label>
      <Arrow id={ID} tone="accent" points={[[505, 44], [505, 20], [240, 20], [240, 44]]} label="emit!: a custom event, depth + 1" />

      {/* the guard */}
      <Box x={10} y={130} w={200} h={50} tone="warn" label="Loop guard" sub="depth 8 or 64 runs: stop" />
      <Arrow id={ID} tone="warn" dashed points={[[170, 130], [170, 94]]} />

      {/* who hears an event */}
      <Frame x={10} y={214} w={700} h={96} label="Listeners: who hears an event" />
      <Label x={24} y={254} tone="ink">{'a cell’s event (click, change, pick, …)'}</Label>
      <Label x={330} y={254} tone="ink">{'that cell’s own on, if it has a handler for it'}</Label>
      <Label x={24} y={274} tone="ink">a custom event (emit!)</Label>
      <Label x={330} y={274} tone="ink">{'every cell with a handler for it, then the document’s on'}</Label>
      <Label x={24} y={294} tone="ink">open, close</Label>
      <Label x={330} y={294} tone="ink">{'the document’s on'}</Label>

      <Label x={10} y={338}>Depth 0 is the event itself, 1 an event that a handler caused, and so on.</Label>
      <Label x={10} y={354}>The guard stops at an event 8 deep or after 64 handlers; what already ran is kept, and the trace says why.</Label>
    </Diagram>
  );
}
