// Lightweight Bangla number/date helpers used by the chart matrix UI.
// All digits are converted using the standard Bengali Unicode block (U+09E6–U+09EF).

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaNumber(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

const MONTHS_BN = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

/** Render an ISO date string (YYYY-MM-DD) as a compact Bangla header:
 *  e.g. "৯ জুলাই ২০২৬".
 */
export function banglaDateLabel(iso: string): { day: string; month: string; year: string } {
  const [y, m, d] = iso.split("-").map((s) => Number(s));
  return {
    day: toBanglaNumber(d),
    month: MONTHS_BN[(m ?? 1) - 1] ?? "",
    year: toBanglaNumber(y),
  };
}

/** Compute the mess-day index (1-based) of `iso` against `startIso`.
 *  Days before the start return 0. Both inputs are YYYY-MM-DD.
 */
export function messDayIndex(iso: string, startIso: string): number {
  const a = Date.parse(iso + "T00:00:00Z");
  const b = Date.parse(startIso + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.round((a - b) / 86_400_000);
  return diff >= 0 ? diff + 1 : 0;
}