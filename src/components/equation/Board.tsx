import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Equation, Side } from '../../engine/types';
import { otherSide } from '../../engine/types';
import type { Command } from '../../engine/moves';
import type { Selection } from '../../state/drop';
import type { WorkspaceState } from '../../state/workspace';
import { speakEquation } from '../../engine/format';
import { Grid, Row, StepGrid } from './Steps';
import { SideRow } from './Terms';

interface BoardProps {
  state: WorkspaceState;
  /** The equation on screen (inspect-aware). */
  eq: Equation;
  hintTarget: Command | null;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>, source: Selection, label: string) => void;
  onActivate: (source: Selection) => void;
}

/**
 * The main equation area. One interactive row normally; while a move animates it becomes the
 * three-row paper-algebra layout. The dashed divider is a grid item in the middle column, so it
 * always sits on the logical equals boundary, however wide or tall the sides become.
 */
export function Board({ state, eq, hintTarget, onPointerDown, onActivate }: BoardProps) {
  const { phase, drag, selection, dividerShown, lastMove } = state;
  const inspecting = state.history.inspect !== null;
  const animating = (phase === 'applying' || phase === 'simplifying') && lastMove !== null;

  let body;
  if (animating && lastMove) {
    body = (
      <StepGrid
        move={lastMove.data}
        phase={phase === 'applying' ? 'op' : 'result'}
        animate
        divider={dividerShown}
        testId="step-stack"
      />
    );
  } else if (inspecting) {
    body = (
      <Grid divider={dividerShown} rows={1} className="inspect">
        <Row row={1} left={<SideRow eq={eq} side="left" terms={eq.left} mode="static" />} right={<SideRow eq={eq} side="right" terms={eq.right} mode="static" />} />
      </Grid>
    );
  } else {
    const validSide: Side | null = drag ? otherSide(drag.source.side) : null;
    const zoneClass = (side: Side): string => {
      if (!drag) return '';
      const classes: string[] = [];
      if (validSide === side) classes.push('zone-target');
      if (drag.zone && drag.zone.side === side && drag.evaluation) classes.push(drag.evaluation.valid ? 'zone-hover-valid' : 'zone-hover-invalid');
      return classes.join(' ');
    };
    const common = { eq, selection, hintTarget, onPointerDown, onActivate };
    body = (
      <Grid divider={dividerShown} rows={1} className={drag ? 'dragging' : ''} testId="interactive-board">
        <div className={`cell cell-left zone ${zoneClass('left')}`} style={{ gridRow: 1 }} data-drop-side="left" data-testid="zone-left">
          <SideRow {...common} side="left" terms={eq.left} mode="interactive" />
          {drag?.zone?.side === 'left' && drag.evaluation?.valid && <span className="drop-hint" aria-hidden="true">{drag.evaluation.reason}</span>}
        </div>
        <div className="cell cell-mid" style={{ gridRow: 1 }}>
          <span className="eq-badge" aria-hidden="true">=</span>
        </div>
        <div className={`cell cell-right zone ${zoneClass('right')}`} style={{ gridRow: 1 }} data-drop-side="right" data-testid="zone-right">
          <SideRow {...common} side="right" terms={eq.right} mode="interactive" />
          {drag?.zone?.side === 'right' && drag.evaluation?.valid && <span className="drop-hint" aria-hidden="true">{drag.evaluation.reason}</span>}
        </div>
      </Grid>
    );
  }

  return (
    <div className="board-scroll" role="group" aria-label={`Equation: ${speakEquation(eq)}`} data-testid="board" data-phase={phase}>
      {body}
    </div>
  );
}
