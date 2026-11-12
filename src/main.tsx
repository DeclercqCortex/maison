import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutosave } from './store/persistence';
import { loadCustomModels } from './catalog/custom';
import './styles.css';

// Set up the project list (bringing over any project saved by an older version) before the start screen lists it.
startAutosave();
// Models the user imported live in IndexedDB; they join the catalog as soon as they have been read.
void loadCustomModels();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
