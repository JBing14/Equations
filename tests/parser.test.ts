import { describe, it, expect } from 'vitest';
import { parseEquation, parseNumber } from '../src/engine/parser';
import { F, P } from './helpers';
import { Rational } from '../src/engine/rational';

describe('parser: valid input becomes a structured model', () => {
  it('parses the examples from the product spec', () => {
    expect(F(P('x + 5 = 12'))).toBe('x + 5 = 12');
    expect(F(P('3x - 4 = 11'))).toBe('3x - 4 = 11');
    expect(F(P('2(x + 3) = 14'))).toBe('2(x + 3) = 14');
    expect(F(P('3x + 5 = x + 13'))).toBe('3x + 5 = x + 13');
    expect(F(P('x/2 + 3 = 7'))).toBe('x/2 + 3 = 7');
  });

  it('keeps coefficient, variable, sign and side distinct', () => {
    const eq = P('3x + 5 = 20');
    expect(eq.left).toHaveLength(2);
    expect(eq.left[0].core.kind).toBe('var');
    expect(eq.left[0].coef.toString()).toBe('3');
    expect(eq.left[0].sign).toBe(1);
    expect(eq.left[1].core.kind).toBe('const');
    expect(eq.right).toHaveLength(1);
    expect(eq.variable).toBe('x');
  });

  it('handles negative numbers and unary minus', () => {
    expect(F(P('-3x + 4 = -8'))).toBe('-3x + 4 = -8');
    expect(F(P('5 - -2 = x'))).toBe('5 + 2 = x');
    expect(F(P('-(x + 3) = 2'))).toBe('-(x + 3) = 2');
  });

  it('reads decimals exactly and remembers the decimal style', () => {
    const eq = P('0.5x + 1.2 = 3.7');
    expect(eq.decimal).toBe(true);
    expect(F(eq)).toBe('0.5x + 1.2 = 3.7');
    expect(eq.left[0].coef.toString()).toBe('1/2');
  });

  it('reads fractions, including fractions that simplify to integers', () => {
    expect(F(P('x + 1/2 = 3/4'))).toBe('x + 1/2 = 3/4');
    expect(F(P('x + 4/2 = 5'))).toBe('x + 2 = 5');
    expect(F(P('3x/4 = 9'))).toBe('3x/4 = 9');
    expect(F(P('(x + 3)/2 = 5'))).toBe('(x + 3)/2 = 5');
  });

  it('accepts any single letter and normalises case', () => {
    expect(P('n + 2 = 9').variable).toBe('n');
    expect(P('2Y = 8').variable).toBe('y');
  });

  it('accepts × ÷ − and implicit multiplication', () => {
    expect(F(P('2×x + 1 = 7'))).toBe('2x + 1 = 7');
    expect(F(P('x ÷ 2 = 4'))).toBe('x/2 = 4');
    expect(F(P('x − 3 = 2'))).toBe('x - 3 = 2');
    expect(F(P('3(x+1)+2 = 11'))).toBe('3(x + 1) + 2 = 11');
  });

  it('removes redundant outer parentheses', () => {
    expect(F(P('(x + 3) = 7'))).toBe('x + 3 = 7');
    expect(F(P('(x) + 3 = 7'))).toBe('x + 3 = 7');
  });

  it('keeps variables on both sides', () => {
    expect(F(P('5x - 2 = 2x + 7'))).toBe('5x - 2 = 2x + 7');
  });
});

describe('parser: invalid input gets a clear message and never throws', () => {
  const bad: [string, string][] = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['x + = 5', 'missing-operand'],
    ['x + 5 =', 'empty-side'],
    ['= 5', 'empty-side'],
    ['x + 5', 'missing-equals'],
    ['x = 1 = 2', 'multiple-equals'],
    ['2(x + 3 = 14', 'unbalanced'],
    ['2x + 3) = 14', 'unbalanced'],
    ['x # 5 = 2', 'bad-char'],
    ['x + $5 = 2', 'bad-char'],
    ['5 = 5', 'no-variable'],
    ['x + y = 5', 'two-variables'],
    ['x * x = 4', 'nonlinear'],
    ['x^2 = 4', 'unsupported'],
    ['x² = 4', 'unsupported'],
    ['3/x = 2', 'nonlinear'],
    ['x/0 = 2', 'div-zero'],
    ['x/(2-2) = 2', 'div-zero'],
    ['2x3 = 6', 'letter-after-number'],
    ['2 3 = x', 'missing-operator'],
    ['()x = 3', 'missing-operand'],
    ['(x+1)(x+2) = 0', 'nonlinear'],
    ['x + 1.2.3 = 4', 'number-format'],
  ];
  for (const [text, code] of bad) {
    it(`rejects ${JSON.stringify(text)} as ${code}`, () => {
      const r = parseEquation(text);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe(code);
        expect(r.message.length).toBeGreaterThan(10);
      }
    });
  }

  it('rejects very long input and deep nesting', () => {
    expect(parseEquation('x + ' + '1 + '.repeat(40) + '1 = 5').ok).toBe(false);
    const deep = '('.repeat(7) + 'x' + ')'.repeat(7) + ' = 1';
    const r = parseEquation(deep);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('too-deep');
  });

  it('treats script-like text as plain invalid characters, never as code', () => {
    for (const evil of ['alert(1) = 2', 'x = 1; process.exit()', 'constructor.constructor("1")() = x', '${1+1} = x']) {
      const r = parseEquation(evil);
      expect(r.ok).toBe(false);
    }
  });
});

describe('parseNumber', () => {
  it('reads integers, decimals, fractions and "x = n" answers', () => {
    expect(parseNumber('7')!.toString()).toBe('7');
    expect(parseNumber('-2.5')!.toString()).toBe('-5/2');
    expect(parseNumber('3/4')!.toString()).toBe('3/4');
    expect(parseNumber('-3/4')!.toString()).toBe('-3/4');
    expect(parseNumber('x = 3')!.toString()).toBe('3');
    expect(parseNumber('  y=-1/2 ')!.toString()).toBe('-1/2');
  });
  it('returns null for anything else', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('2x')).toBeNull();
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('3 +')).toBeNull();
  });
});

describe('Rational', () => {
  it('is exact where floating point is not', () => {
    const a = Rational.fromDecimalString('0.1').add(Rational.fromDecimalString('0.2'));
    expect(a.equals(Rational.fromDecimalString('0.3'))).toBe(true);
    expect(a.toString()).toBe('3/10');
  });
  it('formats decimals only when they terminate', () => {
    expect(Rational.of(3, 4).toDecimalString()).toBe('0.75');
    expect(Rational.of(-5, 2).toDecimalString()).toBe('-2.5');
    expect(Rational.of(1, 3).toDecimalString()).toBeNull();
    expect(Rational.of(8, 1).toDecimalString()).toBe('8');
  });
  it('refuses to divide by zero', () => {
    expect(() => Rational.of(1, 0)).toThrow(/zero/);
    expect(() => Rational.of(1).div(Rational.ZERO)).toThrow(/zero/);
  });
});
