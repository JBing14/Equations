import { useCallback } from 'react';
import type { Command } from '../engine/moves';
import type { Level } from '../engine/generator';
import { useStore } from '../storage/StoreContext';
import type { LastActivity } from '../storage/store';

export interface ActivityInfo {
  kind: LastActivity['kind'];
  label: string;
  ref?: string;
  equation: string;
  problemIndex?: number;
  level?: Level;
  seed?: string;
}

/** Returns a function that remembers where the student is, so Resume can bring them back. */
export function useRememberActivity(): (info: ActivityInfo, commands: Command[]) => void {
  const { update } = useStore();
  return useCallback(
    (info, commands) =>
      update((d) => ({
        ...d,
        last: {
          kind: info.kind,
          label: info.label,
          ref: info.ref ?? '',
          equation: info.equation,
          commands: commands.slice(0, 100),
          problemIndex: info.problemIndex ?? 0,
          level: info.level ?? 1,
          seed: info.seed ?? '',
        },
      })),
    [update],
  );
}
