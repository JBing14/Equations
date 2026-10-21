import type { ReactNode } from 'react';
import type { Equation, Side } from '../../engine/types';
import { sideTerms } from '../../engine/types';
import type { MoveData } from '../../engine/moves';
import type { ChipConfig } from './Terms';
import { EqBadge, SideRow } from './Terms';

/** A grid whose middle column holds the equals sign and the dashed center divider. */
export function Grid({ divider, rows, className = '', testId, children }: { divider: boolean; rows: number; className?: string; testId?: string; children: ReactNode }) {
  return (
    <div className={`board ${className}`} style={{ ['--rows' as string]: rows }} data-testid={testId}>
      {divider && <span className="divider" data-testid="divider" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function Row({ row, left, right, badge = true, className = '' }: { row: number; left: ReactNode; right: ReactNode; badge?: boolean; className?: string }) {
  return (
    <>
      <div className={`cell cell-left ${className}`} style={{ gridRow: row }}>
        {left}
      </div>
      <div className="cell cell-mid" style={{ gridRow: row }}>
        <EqBadge hidden={!badge} />
      </div>
      <div className={`cell cell-right ${className}`} style={{ gridRow: row }}>
        {right}
      </div>
    </>
  );
}

/** Where the operation text is written in the operation row. */
export function chipsFor(move: MoveData): { left: ChipConfig | null; right: ChipConfig | null } {
  const make = (side: Side, text: string | null): ChipConfig | null => {
    if (text === null) return null;
    const terms = sideTerms(move.before, side);
    switch (move.kind) {
      case 'subtract':
      case 'add':
        return { at: move.anchor.side === side ? move.anchor.index : terms.length - 1, text };
      case 'multiply':
      case 'divide':
        return { at: 'all', text };
      default:
        return { at: move.anchor.index, text };
    }
  };
  return { left: make('left', move.opLeft), right: make('right', move.opRight) };
}

export type StepPhase = 'before' | 'op' | 'result' | 'all';

/**
 * A move laid out like paper algebra: the equation, the operation written underneath the
 * matching terms on both sides, then the simplified equation.
 *
 *     x + 5  =  12
 *       − 5     − 5
 *     x      =   7
 */
export function StepGrid({ move, phase = 'all', animate = false, divider = true, className = '', testId }: { move: MoveData; phase?: StepPhase; animate?: boolean; divider?: boolean; className?: string; testId?: string }) {
  const { before, after } = move;
  const chips = chipsFor(move);
  const showOp = phase !== 'before';
  const showAfter = phase === 'result' || phase === 'all';
  const strike = phase === 'result' || phase === 'all';
  const cancelledOn = (side: Side): number[] => move.cancelled.filter((c) => c.side === side).map((c) => c.index);
  return (
    <Grid divider={divider} rows={3} className={`step${animate ? ' animate' : ''} ${className}`} testId={testId}>
      <Row
        row={1}
        left={<SideRow eq={before} side="left" terms={before.left} mode="static" cancelled={strike ? cancelledOn('left') : []} />}
        right={<SideRow eq={before} side="right" terms={before.right} mode="static" cancelled={strike ? cancelledOn('right') : []} />}
      />
      {showOp && (
        <Row
          row={2}
          badge={false}
          className="op-row"
          left={<SideRow eq={before} side="left" terms={before.left} mode="ghost" chip={chips.left} />}
          right={<SideRow eq={before} side="right" terms={before.right} mode="ghost" chip={chips.right} />}
        />
      )}
      {showAfter && (
        <Row
          row={3}
          className="after-row"
          left={<SideRow eq={after} side="left" terms={after.left} mode="static" />}
          right={<SideRow eq={after} side="right" terms={after.right} mode="static" />}
        />
      )}
    </Grid>
  );
}

/** A single equation on one row (the start card, a solved state, an inspected step). */
export function EquationRow({ eq, divider = false, className = '', testId }: { eq: Equation; divider?: boolean; className?: string; testId?: string }) {
  return (
    <Grid divider={divider} rows={1} className={className} testId={testId}>
      <Row row={1} left={<SideRow eq={eq} side="left" terms={eq.left} mode="static" />} right={<SideRow eq={eq} side="right" terms={eq.right} mode="static" />} />
    </Grid>
  );
}
