import type { ReactNode } from 'react';
import { useStore, type Tool } from '../store/store';

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

type Entry = { id: Tool; label: string; shortcut: string; icon: ReactNode };

const GROUPS: Entry[][] = [
  [{ id: 'select', label: 'Select', shortcut: 'V', icon: icon(<path d="M5 3l14 8-6 2-2 6z" />) }],
  [
    {
      id: 'wall', label: 'Wall', shortcut: 'W',
      icon: icon(<><path d="M5 19L19 5" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /></>),
    },
    { id: 'rect', label: 'Room', shortcut: 'R', icon: icon(<rect x="4" y="6" width="16" height="12" />) },
  ],
  [
    { id: 'door', label: 'Door', shortcut: 'D', icon: icon(<><path d="M5 20V5" /><path d="M5 5a15 15 0 0 1 15 15" /><path d="M3 20h18" /></>) },
    { id: 'window', label: 'Window', shortcut: 'N', icon: icon(<><rect x="3" y="9" width="18" height="6" /><path d="M3 12h18" /></>) },
    { id: 'archway', label: 'Archway', shortcut: 'A', icon: icon(<path d="M5 20v-8a7 7 0 0 1 14 0v8" />) },
  ],
  [
    { id: 'stairs', label: 'Stairs', shortcut: 'S', icon: icon(<path d="M3 20h5v-5h5v-5h5V5h3" />) },
    { id: 'fireplace', label: 'Fireplace', shortcut: 'F', icon: icon(<><path d="M4 20V6h16v14" /><path d="M9 20v-6a3 3 0 0 1 6 0v6" /></>) },
    { id: 'column', label: 'Column', shortcut: 'C', icon: icon(<rect x="8" y="8" width="8" height="8" fill="currentColor" />) },
  ],
  [{ id: 'erase', label: 'Erase', shortcut: 'E', icon: icon(<path d="M6 6l12 12M18 6L6 18" />) }],
];

export function ToolRail() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <nav className="tool-rail" aria-label="Drawing tools">
      {GROUPS.map((group, i) => (
        <div className="tool-group" key={i}>
          {group.map((t) => (
            <button key={t.id} className={tool === t.id ? 'active' : ''} title={`${t.label} (${t.shortcut})`}
              aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
