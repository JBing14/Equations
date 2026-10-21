import { parseEquationOrThrow } from '../src/engine/parser';
import { formatEquation, MINUS } from '../src/engine/format';
import type { Equation } from '../src/engine/types';
import type { Command, MoveData } from '../src/engine/moves';
import { applyCommand } from '../src/engine/moves';

export const P = (text: string): Equation => parseEquationOrThrow(text);
/** Equation text with plain hyphens, easier to type in expectations. */
export const F = (eq: Equation): string => formatEquation(eq).replaceAll(MINUS, '-');
export const plain = (s: string | null): string => (s ?? '').replaceAll(MINUS, '-');

export function move(text: string | Equation, cmd: Command): MoveData {
  const eq = typeof text === 'string' ? P(text) : text;
  const r = applyCommand(eq, cmd);
  if (!r.ok) throw new Error(`move failed: ${r.error.message}`);
  return r.move;
}
