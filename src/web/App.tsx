import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Home } from './pages/Home';

// The editor and the data browser load when first visited, so the document list opens fast.
const Editor = lazy(() => import('./editor/Editor').then((m) => ({ default: m.Editor })));
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })));
const DeckPage = lazy(() => import('./decks/DeckPage').then((m) => ({ default: m.DeckPage })));
const Play = lazy(() => import('./play/Play').then((m) => ({ default: m.Play })));
const SharedPage = lazy(() => import('./share/SharedPage').then((m) => ({ default: m.SharedPage })));

const where = () => window.location.pathname + window.location.search;

export function App() {
  const [path, setPath] = useState(where);
  useEffect(() => {
    const onPop = () => setPath(where());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** Go somewhere in the app; `replace` when the page being left shouldn't be gone back to (Play, once over). */
  const navigate = useCallback((to: string, o: { replace?: boolean } = {}) => {
    if (to === where()) return;
    if (o.replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPath(to);
  }, []);

  const [pathname, search] = path.split('?');
  const doc = /^\/d\/([\w-]+)$/.exec(pathname);
  const shared = /^\/s\/([\w-]+)$/.exec(pathname);
  const deck = /^\/deck\/([\w-]+)(\/play)?$/.exec(pathname);
  let page: React.ReactNode;
  if (doc) page = <Editor key={doc[1]} id={doc[1]} navigate={navigate} />;
  else if (shared) page = <SharedPage key={shared[1]} token={shared[1]} />;
  else if (deck?.[2]) {
    // Play goes back to where it was started from, never to itself.
    const from = new URLSearchParams(search ?? '').get('from');
    const back = from && from.startsWith('/') && !from.startsWith('//') ? from : `/deck/${deck[1]}`;
    page = <Play key={deck[1]} id={deck[1]} onLeave={() => navigate(back, { replace: true })} />;
  } else if (deck) page = <DeckPage key={deck[1]} id={deck[1]} navigate={navigate} />;
  else if (pathname === '/data') page = <DataPage navigate={navigate} />;
  else page = <Home navigate={navigate} />;
  return <Suspense fallback={<div className="screen-note">Opening…</div>}>{page}</Suspense>;
}
