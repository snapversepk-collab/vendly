// Small building blocks shared by the Settings sections
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';

export type Save = 'idle' | 'saving' | 'saved' | 'error';

/** Track a save call: idle → saving → saved (fades back to idle) | error */
export function useSaver() {
  const [state, setState] = useState<Save>('idle');
  const [error, setError] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    clearTimeout(t.current);
    setState('saving');
    setError(null);
    try {
      const r = await fn();
      setState('saved');
      t.current = setTimeout(() => setState('idle'), 2000);
      return r;
    } catch (e) {
      setState('error');
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't save");
      return undefined;
    }
  }, []);
  return { state, error, run, setError };
}

/** Card section with a title row (design: 24px radius, 8px padding, inner header 16/18px) */
export function Section({ id, title, sub, action, children, flush = true, style }: {
  id: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode; flush?: boolean; style?: CSSProperties;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card" style={{ padding: flush ? 8 : 24, scrollMarginTop: 90, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: flush ? '16px 18px 12px' : '0 0 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 260px' }}>
          <h2 id={`${id}-h`} className="h-section">{title}</h2>
          {sub && <span style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.45 }}>{sub}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Divided row inside a flush section */
export const rowStyle: CSSProperties = { padding: '14px 18px', borderTop: '1px solid var(--line-soft)' };
