// Starting a deck's Play from anywhere: full screen (while the click still
// counts as the person's), then the player, which knows where to go back to.

export function startPlay(navigate: (path: string) => void, deckId: string, from?: string): void {
  const back = from ?? window.location.pathname + window.location.search;
  requestFull();
  navigate(`/deck/${deckId}/play?from=${encodeURIComponent(back)}`);
}

/** Full screen, when the browser will allow it: only during a real click or key press. */
export function requestFull(): void {
  const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true;
  if (!active || document.fullscreenElement) return;
  try {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  } catch {
    /* full screen is a nicety */
  }
}
