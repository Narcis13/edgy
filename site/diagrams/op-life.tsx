// An op from a keystroke to the other browsers and the cloud log.
// Source: src/web/session.ts (dispatch, flush, onOps, rebase), src/server/app.ts
// (the ops route, change, the events stream), src/server/store.ts (saveDoc),
// src/server/sync.ts (kick, push).

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'op-life';

export function OpLife() {
  return (
    <Diagram
      id={ID}
      w={720}
      h={448}
      title="The life of an op, from a keystroke to the other browsers and the cloud"
      desc="Three groups. Browser A, where someone types: its Session applies the op to its own copy at once, which is the optimistic step, and keeps the op in a pending list, queued and then sent, shown in amber because it is not saved yet. It sends the op with POST /api/docs/:id/ops to the server. The server applies the op with applyOps, then store.saveDoc writes the document and the op log together and gives the next version, shown in green because this is where an op becomes permanent. The server then publishes an ops event on the event stream, an SSE connection that every open browser holds. The event goes back to browser A, which confirms it and drops that batch from pending, and to browser B, which applies it to its confirmed copy and rebases its own pending ops on top. Separately, when sync is on, saving also kicks the sync, which pushes the ops the cloud does not have yet into the cloud log, the one append-only log in the cloud, also green because it is permanent; other machines pull from it. Accent (indigo) marks the path of the typist's own op."
    >
      {/* Browser A */}
      <Frame x={10} y={30} w={210} h={200} label="Browser A: the typist" />
      <Box x={20} y={58} w={190} h={40} tone="accent" label="Session.dispatch" sub="applies it to its own copy" />
      <Box x={20} y={118} w={190} h={40} tone="warn" label="pending" sub="queued, sent, still unsaved" />
      <Box x={20} y={178} w={190} h={40} tone="accent" label="confirms" sub="drops its batch from pending" />
      <Arrow id={ID} tone="accent" points={[[115, 98], [115, 118]]} />

      {/* Server */}
      <Frame x={260} y={30} w={220} h={260} label="Server" />
      <Box x={270} y={58} w={200} h={40} mono label="POST /api/docs/:id/ops" sub="needs edit access" />
      <Box x={270} y={118} w={200} h={40} label="applyOps" sub="the same pure function" />
      <Box x={270} y={178} w={200} h={40} tone="live" label="store.saveDoc" sub="doc and op log, version + 1" />
      <Box x={270} y={238} w={200} h={40} label="hub.publish" sub="an ops event on each stream" />
      <Arrow id={ID} points={[[370, 98], [370, 118]]} />
      <Arrow id={ID} points={[[370, 158], [370, 178]]} />
      <Arrow id={ID} points={[[370, 218], [370, 238]]} />

      {/* the request */}
      <Arrow id={ID} tone="accent" points={[[210, 138], [252, 138], [252, 78], [270, 78]]} label="POST" labelAt={[236, 130]} />

      {/* the event stream back to both browsers */}
      <Arrow id={ID} tone="accent" points={[[270, 250], [232, 250], [232, 198], [210, 198]]} />
      <Arrow id={ID} points={[[270, 266], [240, 266], [240, 298], [210, 298]]} />

      {/* Browser B */}
      <Frame x={10} y={250} w={210} h={140} label="Browser B: another reader" />
      <Box x={20} y={278} w={190} h={40} label="applyOps" sub="on its confirmed copy" />
      <Box x={20} y={338} w={190} h={40} label="rebase" sub="its own pending ops on top" />
      <Arrow id={ID} points={[[115, 318], [115, 338]]} />

      {/* the cloud */}
      <Frame x={520} y={150} w={190} h={140} label="Cloud, when sync is on" />
      <Box x={530} y={178} w={170} h={40} label="sync push" sub="ops the cloud lacks" />
      <Box x={530} y={238} w={170} h={40} tone="live" label="cloud log" sub="one order for all" />
      <Arrow id={ID} dashed points={[[470, 198], [530, 198]]} />
      <Arrow id={ID} dashed points={[[615, 218], [615, 238]]} />
      <Label x={615} y={308} anchor="middle">other machines pull from it</Label>

      {/* what each side does with it */}
      <Label x={260} y={336}>A keeps the op pending until its own event comes back.</Label>
      <Label x={260} y={352}>If none comes within a second, A fetches the document again.</Label>
      <Label x={260} y={368}>If the server refuses the op, A drops it and says so.</Label>
      <Label x={260} y={384}>B applies the event to its confirmed copy, then replays</Label>
      <Label x={260} y={400}>its own pending ops on top of it: a rebase.</Label>
      <Label x={260} y={420}>When a pull from the cloud rewrites the history, a reset</Label>
      <Label x={260} y={436}>event makes every browser load the document again.</Label>
    </Diagram>
  );
}
