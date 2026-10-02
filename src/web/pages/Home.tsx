import { Database, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme';
import { Library } from './library/Library';
import { Logo } from './Logo';
import './library/library.css';

export function Shell({ page, navigate, children }: { page: 'docs' | 'data'; navigate: (p: string) => void; children: React.ReactNode }) {
  const [theme, setTheme] = useTheme();
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={go('/')}><Logo /></a>
        <nav className="nav">
          <a href="/" className={page === 'docs' ? 'is-on' : ''} onClick={go('/')}>Documents</a>
          <a href="/data" className={page === 'data' ? 'is-on' : ''} onClick={go('/data')}><Database size={14} /> Data</a>
        </nav>
        <div className="grow" />
        <button className="icon-btn" title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </header>
      {children}
    </div>
  );
}

/** The home page: the library of documents and decks. */
export function Home({ navigate }: { navigate: (p: string) => void }) {
  return (
    <Shell page="docs" navigate={navigate}>
      <Library navigate={navigate} />
    </Shell>
  );
}
