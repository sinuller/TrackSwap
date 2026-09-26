/** ln(n!) by summation – plenty for n ≤ ~1000. */
function lnFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

/**
 * One-sided binomial test: probability of getting at least k correct answers
 * out of n trials by pure guessing (p = 0.5).
 */
export function abxPValue(k: number, n: number): number {
  if (n <= 0) return 1;
  const lnN = lnFactorial(n);
  let p = 0;
  for (let i = k; i <= n; i++) {
    p += Math.exp(lnN - lnFactorial(i) - lnFactorial(n - i) - n * Math.LN2);
  }
  return Math.min(1, p);
}
