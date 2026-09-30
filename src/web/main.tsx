import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/recursive/full.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './styles.css';
import { App } from './App';
import { applyTheme, currentTheme } from './theme';

applyTheme(currentTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
