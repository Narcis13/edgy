// (•) — a cell between two parentheses: the membrane, the nucleus, and the
// s-expression it is stored as.

export function Logo({ size = 22, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <span className="logo-mark" aria-hidden>
        <span className="paren">(</span>
        <span className="nucleus" />
        <span className="paren">)</span>
      </span>
      {word && <span className="logo-word">edgy</span>}
    </span>
  );
}
