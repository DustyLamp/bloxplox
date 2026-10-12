import { useEffect, useState, type SetStateAction } from 'react';
import { canonical, changedFields } from '../../domain/src/index';

/** Bring remote updates into untouched fields without replacing an in-progress edit. */
export function useLiveDraft<T extends { id: string }>(initial: T, current?: T) {
  const [state, setState] = useState({ draft: initial, baseline: initial });
  const version = canonical(current);
  useEffect(() => {
    if (!current) return;
    setState(previous => canonical(previous.baseline) === version ? previous : {
      baseline: current, draft: { ...current, ...changedFields(previous.baseline, previous.draft) },
    });
  }, [version]);
  const setDraft = (update: SetStateAction<T>) => setState(previous => ({ ...previous, draft: typeof update === 'function' ? (update as (value: T) => T)(previous.draft) : update }));
  return [state.draft, setDraft, state.baseline] as const;
}
