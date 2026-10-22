import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import { App } from './App';
import { applyTheme, currentTheme } from './theme';

applyTheme(currentTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A newer build replaced the one this tab loaded (a page's code is gone from the server): load the new one, once.
// If that doesn't help, the page's own error says so, with a Reload button.
window.addEventListener('vite:preloadError', (e) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('edgy-reloaded') ?? 0); } catch { /* no storage: reload anyway */ }
  if (Date.now() - last < 30_000) return;
  try { sessionStorage.setItem('edgy-reloaded', String(Date.now())); } catch { /* as above */ }
  e.preventDefault();
  window.location.reload();
});
