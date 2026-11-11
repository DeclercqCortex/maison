import { useEffect, useRef } from 'react';
import { sampleProject } from './model/sample';
import { markWelcomed } from './store/persistence';
import { useStore } from './store/store';

const STEPS = [
  { title: '1. Plan', text: 'Draw walls on the paper, then add doors, windows and stairs. Rooms appear by themselves, and you can stack floors.' },
  { title: '2. Interior', text: 'See the floor in 3D. Pick furniture from the catalog and click to place it, choose flooring and paint, or walk through.' },
  { title: '3. Exterior', text: 'See the whole house on its lot. Set the lot size in acres, choose a roof, and plant the garden.' },
];

const SHORTCUTS: { heading: string; keys: [string, string][] }[] = [
  {
    heading: 'Everywhere',
    keys: [['1  2  3', 'Plan, Interior, Exterior'], ['Ctrl + Z / Y', 'Undo / redo'], ['Ctrl + S', 'Save to a file'], ['?', 'This guide'], ['Esc', 'Cancel or deselect']],
  },
  {
    heading: 'Plan',
    keys: [
      ['V  W  R', 'Select, Wall, Room'], ['D  N  A', 'Door, Window, Archway'], ['S  F  C', 'Stairs, Fireplace, Column'], ['E', 'Erase'],
      ['T', 'Turn stairs or a fireplace'], ['Type a length + Enter', 'Exact wall length'], ['Alt', 'Turn off snapping'], ['Space + drag', 'Move the paper'],
    ],
  },
  {
    heading: 'Interior and Exterior',
    keys: [
      ['T / Shift + T', 'Turn a quarter / a little'], ['Shift + click', 'Place several'], ['Alt', 'Place freely'], ['Delete', 'Remove the selected piece'],
      ['W A S D', 'Move while walking through'],
    ],
  },
];

/** The welcome guide: what the three tabs are for, an example house to explore, and the keyboard shortcuts. */
export function Help() {
  const open = useStore((s) => s.help);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = () => {
    markWelcomed();
    useStore.getState().setHelp(false);
  };
  const loadExample = () => {
    const st = useStore.getState();
    const hasWork = st.project.floors.some((f) => f.walls.length > 0);
    if (hasWork && !window.confirm('Open the example house? Your current plan will be replaced. Save it to a file first if you want to keep it.')) return;
    st.loadProject(sampleProject());
    st.setMode('plan');
    st.setTool('select');
    close();
  };

  return (
    <dialog ref={dialog} className="help" onClose={close} aria-labelledby="help-title">
      <h1 id="help-title">Welcome to Maison</h1>
      <p className="lead">Design a house on paper, then furnish it and see it standing in the countryside.</p>
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.title}>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
      <div className="actions">
        <button className="primary" onClick={close}>Start drawing</button>
        <button onClick={loadExample}>Open the example house</button>
      </div>
      <details>
        <summary>Keyboard shortcuts</summary>
        <div className="shortcuts">
          {SHORTCUTS.map((group) => (
            <div key={group.heading}>
              <h2>{group.heading}</h2>
              <dl>
                {group.keys.map(([key, what]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
      <p className="note">Your work is saved in this browser as you go. Use “Save file” to keep a copy or move it to another computer.</p>
    </dialog>
  );
}
