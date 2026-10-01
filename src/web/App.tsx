import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Home } from './pages/Home';

// The editor and the data browser load when first visited, so the document list opens fast.
const Editor = lazy(() => import('./editor/Editor').then((m) => ({ default: m.Editor })));
const DataPage = lazy(() => import('./pages/DataPage').then((m) => ({ default: m.DataPage })));

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, '', to);
    setPath(to);
  }, []);

  const doc = /^\/d\/([\w-]+)$/.exec(path);
  return (
    <Suspense fallback={<div className="screen-note">Opening…</div>}>
      {doc ? <Editor key={doc[1]} id={doc[1]} navigate={navigate} /> : path === '/data' ? <DataPage navigate={navigate} /> : <Home navigate={navigate} />}
    </Suspense>
  );
}
