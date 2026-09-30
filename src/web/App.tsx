import { useCallback, useEffect, useState } from 'react';
import { Editor } from './editor/Editor';
import { DataPage } from './pages/DataPage';
import { Home } from './pages/Home';

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
  if (doc) return <Editor key={doc[1]} id={doc[1]} navigate={navigate} />;
  if (path === '/data') return <DataPage navigate={navigate} />;
  return <Home navigate={navigate} />;
}
