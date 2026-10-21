/**
 * Exact rational arithmetic on BigInt numerators and denominators.
 * Every number in the equation engine is a Rational, so 0.1 + 0.2 is exactly 3/10
 * and "is this the solution?" never depends on floating-point rounding.
 */

const LIMIT = 10n ** 30n;

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export class Rational {
  /** Numerator (carries the sign). */
  readonly n: bigint;
  /** Denominator (always > 0, always in lowest terms with n). */
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static of(n: number | bigint, d: number | bigint = 1): Rational {
    let num = BigInt(n);
    let den = BigInt(d);
    if (den === 0n) throw new RangeError('Division by zero');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den) || 1n;
    num /= g;
    den /= g;
    if (num > LIMIT || num < -LIMIT || den > LIMIT) throw new RangeError('Number too large');
    return new Rational(num, den);
  }

  /** Parse a plain non-negative decimal literal such as "12", "0.5" or ".25". */
  static fromDecimalString(text: string): Rational {
    const [intPart = '', fracPart = ''] = text.split('.');
    const digits = (intPart + fracPart).replace(/^0+(?=\d)/, '') || '0';
    return Rational.of(BigInt(digits), 10n ** BigInt(fracPart.length));
  }

  static readonly ZERO = Rational.of(0);
  static readonly ONE = Rational.of(1);

  add(o: Rational): Rational {
    return Rational.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rational): Rational {
    return Rational.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rational): Rational {
    return Rational.of(this.n * o.n, this.d * o.d);
  }
  div(o: Rational): Rational {
    if (o.n === 0n) throw new RangeError('Division by zero');
    return Rational.of(this.n * o.d, this.d * o.n);
  }
  neg(): Rational {
    return new Rational(-this.n, this.d);
  }
  abs(): Rational {
    return this.n < 0n ? this.neg() : this;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isInteger(): boolean {
    return this.d === 1n;
  }
  /** -1, 0 or 1 */
  sign(): -1 | 0 | 1 {
    return this.n < 0n ? -1 : this.n > 0n ? 1 : 0;
  }
  equals(o: Rational): boolean {
    return this.n === o.n && this.d === o.d;
  }
  compare(o: Rational): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  /** "3", "-3", "3/4" or "-3/4" (ASCII minus; used for storage and tests). */
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }

  /**
   * Terminating decimal text ("0.75", "-2.5", "4") or null when the value
   * has no short exact decimal form (such as 1/3).
   */
  toDecimalString(maxDigits = 8): string | null {
    let rest = this.d;
    let twos = 0;
    let fives = 0;
    while (rest % 2n === 0n) {
      rest /= 2n;
      twos++;
    }
    while (rest % 5n === 0n) {
      rest /= 5n;
      fives++;
    }
    if (rest !== 1n) return null;
    const k = Math.max(twos, fives);
    if (k > maxDigits) return null;
    const scaled = (this.abs().n * 10n ** BigInt(k)) / this.d;
    let text = scaled.toString().padStart(k + 1, '0');
    if (k > 0) {
      text = `${text.slice(0, text.length - k)}.${text.slice(text.length - k)}`;
      text = text.replace(/0+$/, '').replace(/\.$/, '');
    }
    return this.n < 0n ? `-${text}` : text;
  }
}

export const R = (n: number | bigint, d: number | bigint = 1): Rational => Rational.of(n, d);
