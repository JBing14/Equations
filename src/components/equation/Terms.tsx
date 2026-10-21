import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Equation, Side, Term } from '../../engine/types';
import { MINUS, formatSignedTerm, termParts } from '../../engine/format';
import { factorOf } from '../../engine/moves';
import type { Command } from '../../engine/moves';
import type { Selection } from '../../state/drop';
import { sameSelection } from '../../state/drop';

/** Read symbols aloud sensibly for screen readers. */
export const spoken = (text: string): string =>
  text.replaceAll(MINUS, ' minus ').replaceAll('+', ' plus ').replaceAll('/', ' over ').replace(/\s+/g, ' ').trim();

export function Frac({ num, den }: { num: ReactNode; den: ReactNode }) {
  return (
    <span className="frac">
      <span className="frac-num">{num}</span>
      <span className="frac-den">{den}</span>
    </span>
  );
}

/** The sign shown before a term: leading terms only show a minus; later terms show + or −. */
function SignMark({ index, term }: { index: number; term: Term }) {
  if (index === 0) return term.sign === -1 ? <span className="sg sg-lead">{MINUS}</span> : null;
  return <span className="sg">{term.sign === 1 ? '+' : MINUS}</span>;
}

/** The body of a term (no sign) laid out with real fractions. */
export function TermBody({ term, eq, coefSlot, denSlot }: { term: Term; eq: Equation; coefSlot?: ReactNode; denSlot?: ReactNode }) {
  const p = termParts(term, eq);
  const coef = coefSlot ?? p.coefText;
  const core = p.kind === 'var' ? <span className="var">{p.coreText}</span> : p.coreText;
  const top = (
    <>
      {coef}
      {core}
    </>
  );
  if (p.den === null) return <span className="tb">{top}</span>;
  return <Frac num={top} den={denSlot ?? p.den} />;
}

export interface ChipConfig {
  /** Which term gets the operation text under it, or the whole side. */
  at: number | 'all';
  text: string;
  cancel?: boolean;
}

export interface SideRowProps {
  eq: Equation;
  side: Side;
  terms: readonly Term[];
  mode: 'interactive' | 'static' | 'ghost';
  selection?: Selection | null;
  hintTarget?: Command | null;
  /** Indexes of terms drawn struck-through (the cancellation animation). */
  cancelled?: readonly number[];
  /** Ghost mode: operation text written under a term (or the whole side). */
  chip?: ChipConfig | null;
  disabled?: boolean;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>, source: Selection, label: string) => void;
  onActivate?: (source: Selection) => void;
}

/** One side of an equation as a row of terms. Interactive terms are real buttons. */
export function SideRow(props: SideRowProps) {
  const { eq, side, terms, mode, selection = null, hintTarget = null, cancelled = [], chip = null, disabled = false } = props;
  const single = terms.length === 1;

  const hintAt = (index: number, part?: 'coef' | 'den'): boolean => {
    if (!hintTarget || !('side' in hintTarget) || hintTarget.side !== side) return false;
    if (hintTarget.type === 'combine') return terms[index]?.core.kind === hintTarget.kind;
    if (hintTarget.type === 'scale') return part ? hintTarget.index === index && hintTarget.part === part : hintTarget.index === index;
    return hintTarget.index === index;
  };

  return (
    <span className={`side-row side-${side} mode-${mode}`} role={mode === 'interactive' ? 'group' : undefined} aria-label={mode === 'interactive' ? `${side} side` : undefined}>
      {terms.map((term, i) => {
        const kindClass = `term kind-${term.core.kind}`;
        const struck = cancelled.includes(i) ? ' cancelled' : '';
        const showChip = chip !== null && (chip.at === i || chip.at === 'all');
        const key = `${side}-${i}`;

        if (mode === 'ghost') {
          return (
            <span key={key} className={`${kindClass} ghost`}>
              <span className="ghost-body" aria-hidden="true">
                <SignMark index={i} term={term} />
                <TermBody term={term} eq={eq} />
              </span>
              {showChip && chip!.at === i && <span className={`op-chip${chip!.cancel ? ' op-cancel' : ''}`}>{chip!.text}</span>}
            </span>
          );
        }

        if (mode === 'static') {
          return (
            <span key={key} className={`${kindClass}${struck}`}>
              <SignMark index={i} term={term} />
              <TermBody term={term} eq={eq} />
            </span>
          );
        }

        // interactive
        const factorCoef = single ? factorOf(eq, term, 'coef') : null;
        const factorDen = single ? factorOf(eq, term, 'den') : null;
        if (single && term.core.kind !== 'const' && (factorCoef !== null || factorDen !== null)) {
          const p = termParts(term, eq);
          const coefSel: Selection = { kind: 'factor', side, index: i, part: 'coef' };
          const denSel: Selection = { kind: 'factor', side, index: i, part: 'den' };
          const chipButton = (sel: Selection, text: string, label: string, hint: boolean): ReactNode => (
            <button
              type="button"
              className={`chip${sameSelection(selection, sel) ? ' selected' : ''}${hint ? ' hint' : ''}`}
              aria-pressed={sameSelection(selection, sel)}
              aria-label={label}
              disabled={disabled}
              data-factor={sel.kind === 'factor' ? sel.part : undefined}
              onPointerDown={(e) => props.onPointerDown?.(e, sel, text)}
              onClick={(e) => {
                if (e.detail === 0) props.onActivate?.(sel);
              }}
            >
              {text}
            </button>
          );
          const coefText = (term.sign === -1 ? MINUS : '') + p.coefText;
          const coefNode =
            factorCoef !== null
              ? chipButton(coefSel, coefText, `The number multiplying ${eq.variable} on the ${side} side: ${spoken(coefText)}. Select to undo it on both sides.`, hintAt(i, 'coef'))
              : term.sign === -1
                ? MINUS
                : null;
          const denNode =
            factorDen !== null && p.den !== null
              ? chipButton(denSel, p.den, `The number dividing ${eq.variable} on the ${side} side: ${p.den}. Select to undo it on both sides.`, hintAt(i, 'den'))
              : undefined;
          return (
            <span key={key} className={`${kindClass} has-chips${struck}`} role="group" aria-label={`${spoken(formatSignedTerm(term, eq))} on the ${side} side`}>
              <TermBody term={term} eq={eq} coefSlot={coefNode} denSlot={denNode} />
            </span>
          );
        }

        const sel: Selection = { kind: 'term', side, index: i };
        const isSel = sameSelection(selection, sel);
        const label = `${side} side: ${spoken(formatSignedTerm(term, eq))}. Select it, then choose an operation, or drag it across the equals sign.`;
        return (
          <button
            key={key}
            type="button"
            className={`${kindClass} term-btn${isSel ? ' selected' : ''}${hintAt(i) ? ' hint' : ''}${struck}`}
            aria-pressed={isSel}
            aria-label={label}
            disabled={disabled}
            data-term-side={side}
            data-term-index={i}
            onPointerDown={(e) => props.onPointerDown?.(e, sel, formatSignedTerm(term, eq))}
            onClick={(e) => {
              if (e.detail === 0) props.onActivate?.(sel);
            }}
          >
            <SignMark index={i} term={term} />
            <TermBody term={term} eq={eq} />
          </button>
        );
      })}
      {mode === 'ghost' && chip?.at === 'all' && <span className={`op-chip op-chip-all${chip.cancel ? ' op-cancel' : ''}`}>{chip.text}</span>}
    </span>
  );
}

export function EqBadge({ hidden }: { hidden?: boolean }) {
  return (
    <span className={`eq-badge${hidden ? ' hidden' : ''}`} aria-hidden={hidden ? 'true' : undefined}>
      {hidden ? '' : '='}
    </span>
  );
}
