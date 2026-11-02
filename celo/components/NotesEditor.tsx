'use client';

import { useEffect, useRef, useState } from 'react';
import { saveClientNotes } from '@/lib/actions';

/** Freeform client notes, saved automatically a second after you stop typing. */
export function NotesEditor({ clientId, initial }: { clientId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState('dirty');
          clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(async () => {
            setState('saving');
            await saveClientNotes(clientId, v);
            setState('saved');
          }, 900);
        }}
        rows={8}
        placeholder="Account context, logins vault link, preferences, what was promised on the last call..."
        className="field resize-y text-[13.5px] leading-relaxed"
      />
      <div className="mt-1.5 text-right text-[11px] text-faint">{state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving' : 'Editing'}</div>
    </div>
  );
}
