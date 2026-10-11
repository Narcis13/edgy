// Who may do what: who is asking, what the route needs, the roles, the answers.
// Source: src/server/access.ts (Principal, Need, check), src/server/auth.ts, and
// resolve() in src/server/app.ts.

import { Arrow, Box, Diagram, Frame, Label } from './kit';

const ID = 'access-model';

const NEEDS: { name: string; sub: string }[] = [
  { name: 'public', sub: 'anyone: health, sign up, sign in' },
  { name: 'in', sub: 'a person or a guest' },
  { name: 'user', sub: 'a person: cookie, key or this machine' },
  { name: 'person', sub: 'a person at the browser, not a key' },
  { name: 'doc: view | edit | owner', sub: 'your role on :id; a link may stand in' },
  { name: 'deck: owner', sub: 'the deck’s owner only' },
  { name: 'data: read | write', sub: 'own collections, or a document’s via ?doc=' },
  { name: 'guest', sub: 'a guest only: what does this link open?' },
];

export function AccessModel() {
  return (
    <Diagram
      id={ID}
      w={720}
      h={436}
      title="Who is asking, what the route needs, and how it is answered"
      desc="Three columns, read left to right. First, who is asking, settled before anything else: a person, known by a session cookie from the browser; an agent, which is a person's API key; a guest, who holds a share link's token; local mode, where a request from this machine itself is treated as one person; and nobody, who sent no credential. Second, what the route needs, declared on every route as need: public, anyone; in, a person or a guest; user, a person; person, a person at the browser and not an agent with a key; doc with view, edit or owner, a role on the document in the address, which a guest's link can stand in for; deck owner; data read or write, the person's own collections or a document owner's through that document; and guest, a guest only. Third, what comes back: either a role on the document, owner above editor above viewer, shown in green because the request is let in, or a refusal, shown in red: 401 sign in first, 403 when the role or the link is too low, and 404 for a stranger, as if the document did not exist. A person is drawn in the accent colour (indigo), and local mode in the same colour with a dashed outline because it is a person by being on this machine; an agent has its own colour (pink); a guest, who reaches a single document, is amber; and nobody, who is refused almost everywhere, is a plain dashed outline."
    >
      <Label x={10} y={20} tone="ink" size="label">Who is asking</Label>
      <Label x={200} y={20} tone="ink" size="label">What the route needs</Label>
      <Label x={550} y={20} tone="ink" size="label">What comes back</Label>

      {/* who is asking */}
      <Box x={10} y={36} w={155} h={46} tone="accent" label="a person" sub="session cookie" />
      <Box x={10} y={94} w={155} h={46} tone="agent" label="an agent" sub="API key, edgy_…" />
      <Box x={10} y={152} w={155} h={46} tone="warn" label="a guest" sub="share link token" />
      <Box x={10} y={210} w={155} h={46} tone="accent" dashed label="local mode" sub="this machine only" />
      <Box x={10} y={268} w={155} h={46} tone="muted" dashed label="nobody" sub="no credential" />
      {[59, 117, 175, 233, 291].map((y) => <Arrow key={y} id={ID} points={[[165, y], [200, y]]} />)}

      {/* what the route needs */}
      <Frame x={200} y={28} w={320} h={292} />
      {NEEDS.map((n, i) => (
        <g key={n.name}>
          <Label x={214} y={54 + i * 33} tone="ink" size="label" mono>{n.name}</Label>
          <Label x={214} y={69 + i * 33}>{n.sub}</Label>
        </g>
      ))}

      {/* what comes back */}
      <Frame x={550} y={28} w={160} h={166} label="roles, highest first" />
      <Box x={560} y={56} w={140} h={38} tone="live" label="owner" sub="also shares, people" />
      <Box x={560} y={100} w={140} h={38} tone="live" label="editor" sub="reads and changes" />
      <Box x={560} y={144} w={140} h={38} tone="live" label="viewer" sub="reads" />
      <Arrow id={ID} tone="live" points={[[520, 110], [550, 110]]} />

      <Frame x={550} y={214} w={160} h={162} label="or an answer" />
      <Box x={560} y={240} w={140} h={38} tone="bad" label="401" sub="sign in first" />
      <Box x={560} y={284} w={140} h={38} tone="bad" label="403" sub="role or link too low" />
      <Box x={560} y={328} w={140} h={38} tone="bad" label="404" sub="no such document" />
      <Arrow id={ID} tone="bad" points={[[520, 295], [550, 295]]} />

      <Label x={10} y={392}>The guard runs first on every /api route, and a test fails any route that has no need.</Label>
      <Label x={10} y={408}>Nobody gets 401 everywhere except health, sign up and sign in. A stranger to a document gets 404, as if it</Label>
      <Label x={10} y={424}>did not exist; a role that is too low gets 403. Local mode trusts requests that come from this machine.</Label>
    </Diagram>
  );
}
