import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutosave } from './store/persistence';
import './styles.css';

// Set up the project list (bringing over any project saved by an older version) before the start screen lists it.
startAutosave();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
