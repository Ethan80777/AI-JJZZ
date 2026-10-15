import { useEffect, useRef, useState } from 'react';
import { SaveQueue } from './save-queue';
export type FlushSetter = (flush: () => Promise<boolean>) => void;
export function useDraftRecords<T extends { id: string }>(
  persisted: T[],
  save: (value: T) => Promise<boolean | void> | boolean | void,
  setFlush?: FlushSetter,
) {
  const drafts = useRef(new Map<string, T>()),
    queues = useRef(new Map<string, SaveQueue<T>>());
  const [, render] = useState(0);
  const [states, setStates] = useState<Record<string, string>>({});
  const saveRef = useRef(save);
  saveRef.current = save;
  const flush = async () => {
    let success = true;
    for (const queue of queues.current.values()) if (!(await queue.flush())) success = false;
    return success;
  };
  useEffect(() => {
    setFlush?.(flush);
    return () => {
      setFlush?.(async () => true);
      for (const queue of queues.current.values()) queue.cancelPending();
    };
  }, []);
  const update = (value: T) => {
    drafts.current.set(value.id, value);
    render((n) => n + 1);
    let queue = queues.current.get(value.id);
    if (!queue) {
      queue = new SaveQueue<T>(
        async (v) => {
          if ((await saveRef.current(v)) === false) throw Error('save failed');
        },
        (state) => setStates((s) => ({ ...s, [value.id]: state })),
      );
      queues.current.set(value.id, queue);
    }
    queue.put(value);
    void queue.flush();
  };
  const rows = [
    ...new Map([...persisted.map((v) => [v.id, v] as const), ...drafts.current]).values(),
  ];
  return {
    rows,
    update,
    flush,
    failed: Object.values(states).includes('error'),
    saving: Object.values(states).some((s) => s === 'dirty' || s === 'saving'),
  };
}
