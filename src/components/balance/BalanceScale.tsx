import type { Equation, Side, Term } from '../../engine/types';
import { sideTerms } from '../../engine/types';
import { formatSignedTerm, formatSum, speakEquation } from '../../engine/format';
import type { MoveData } from '../../engine/moves';
import { spoken } from '../equation/Terms';

/**
 * An abstract balance scale. It is a teaching aid, not a physics simulation:
 * - letters are square blocks, plain numbers are round tokens, groups are bracketed bags,
 * - negative terms are drawn as dashed "balloons" with an up arrow (they lift the pan),
 * - the beam always stays level, because a valid operation never unbalances an equation.
 */

export interface ScaleChip {
  readonly key: string;
  readonly label: string;
  readonly kind: 'var' | 'const' | 'group';
  readonly negative: boolean;
}

/** Pure description of one pan, so it can be tested without rendering. */
export function panChips(eq: Equation, side: Side): ScaleChip[] {
  return sideTerms(eq, side).map((t: Term, i) => ({
    key: `${side}-${i}`,
    label: formatSignedTerm(t, eq).replace(/^\+/, ''),
    kind: t.core.kind,
    negative: t.sign === -1,
  }));
}

function Pan({ eq, side, ghostText }: { eq: Equation; side: Side; ghostText: string | null }) {
  const chips = panChips(eq, side);
  return (
    <div className={`pan pan-${side}`} data-testid={`pan-${side}`}>
      <div className="pan-items">
        {chips.map((c) => (
          <span key={c.key} className={`weight w-${c.kind}${c.negative ? ' w-neg' : ''}`}>
            {c.negative && <span className="lift" aria-hidden="true">↑</span>}
            {c.label}
          </span>
        ))}
        {ghostText && <span className="weight w-ghost" data-testid={`ghost-${side}`}>{ghostText}</span>}
      </div>
      <div className="pan-dish" />
    </div>
  );
}

export function BalanceScale({ eq, move }: { eq: Equation; move: MoveData | null }) {
  const label = `Balance scale. Left pan: ${spoken(formatSum(eq.left, eq))}. Right pan: ${spoken(formatSum(eq.right, eq))}. The scale is balanced, because ${speakEquation(eq)}.`;
  return (
    <div className="scale" role="img" aria-label={label} data-testid="balance-scale">
      <div className="scale-stage">
        <Pan eq={eq} side="left" ghostText={move?.opLeft ?? null} />
        <div className="scale-center" aria-hidden="true">
          <div className="beam" />
          <div className="fulcrum" />
        </div>
        <Pan eq={eq} side="right" ghostText={move?.opRight ?? null} />
      </div>
      <p className="scale-caption" aria-hidden="true">
        Balanced: both sides are equal.
      </p>
    </div>
  );
}
