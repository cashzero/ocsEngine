import { html, type TemplateResult } from 'lit-html';

/**
 * Air combat reads as long sentences ("P-38 vs Fw-190a: 9 (roll 8), Fw-190a aborts and loses a step."). The rules layer words them;
 * this picks the parts a player scans for out of the sentence: who flew, the roll that decided it, and what it cost. The text itself
 * is never changed, only wrapped, so the history and the saved log keep the plain wording.
 *
 * Classes (web/command-deck.css): air-name = the aircraft, air-num = a roll or total, air-term = a rule term, air-loss = a step lost,
 * air-abort = an aircraft turned away, air-ok = nothing lost or the aircraft stays Active.
 */

type Kind = 'air-name' | 'air-num' | 'air-term' | 'air-loss' | 'air-abort' | 'air-ok';

interface Rule { readonly pattern: RegExp; readonly kind: Kind; /** Capture group to mark; the whole match when omitted. */ readonly group?: number }

// Earlier rules win where two overlap, so the sentence-shaped rules (names, outcomes) come before the bare terms.
const RULES: readonly Rule[] = [
  // "P-38 vs Fw-190a: 9 (roll 8), ..." — both names
  { pattern: /^(.+?) vs (?=.+?:)/gu, kind: 'air-name', group: 1 },
  { pattern: /(?<= vs )(.+?)(?=: )/gu, kind: 'air-name', group: 1 },
  // "P-38 (Air Combat 8, reduced)" in decision prompts and option labels, with or without a leading "Abort "
  { pattern: /(?:Abort |: |^)([^:()]+?) (?=\(Air Combat )/gu, kind: 'air-name', group: 1 },
  { pattern: /\(Air Combat \(?\d+\)?(?:, reduced)?\)/gu, kind: 'air-num' },
  // "<aircraft> aborts before…", "<aircraft> intercepts", "<aircraft> is reduced by Flak"
  { pattern: /^(.+?)(?= (?:aborts|intercepts|wins the interception|is reduced|is destroyed|has no friendly))/gu, kind: 'air-name', group: 1 },
  { pattern: /(?<=, )([^,]+?)(?= aborts)/gu, kind: 'air-name', group: 1 },
  { pattern: /\bloses a step\b|\bstep is lost\b|\bis destroyed\b|\bis reduced\b|\bis lost\b|\bdriven off\b/giu, kind: 'air-loss' },
  { pattern: /\bboth abort\b|\baborts\b|\bAbort\b/gu, kind: 'air-abort' },
  // The return choice that is the base the aircraft took off from
  { pattern: /^Original Air Base\b/gu, kind: 'air-ok' },
  { pattern: /\bIt took off from [^\s.]+/gu, kind: 'air-ok' },
  { pattern: /\bstays Active\b|\bwins the interception\b|\bno effect\b|\bNo interception\b/giu, kind: 'air-ok' },
  // "…: 9 (roll 8)", "Flak: 10 (roll 9 +1)", "roll 8"
  { pattern: /(?<=: )(\d+)(?= \(roll)/gu, kind: 'air-num', group: 1 },
  { pattern: /\(roll [^)]*\)/gu, kind: 'air-num' },
  { pattern: /\bAir Combat\b|\bFlak\b|\binterception\b|\bintercepts\b|\bPatrol Zone\b|\bround \d+\b/gu, kind: 'air-term' },
];

interface Span { readonly start: number; readonly end: number; readonly kind: Kind }

const spansOf = (line: string): readonly Span[] => {
  const found: Span[] = [];
  for (const { pattern, kind, group } of RULES) {
    for (const match of line.matchAll(pattern)) {
      const piece = group === undefined ? match[0] : match[group];
      if (!piece) continue;
      const start = match.index + (group === undefined ? 0 : match[0].indexOf(piece));
      found.push({ start, end: start + piece.length, kind });
    }
  }
  // Sorted by position, then by the order the rules were listed in, so a name is not swallowed by a bare term inside it.
  const order = found.map((span, index) => ({ span, index })).sort((left, right) => left.span.start - right.span.start || left.index - right.index);
  const kept: Span[] = [];
  for (const { span } of order) if (span.start >= (kept.at(-1)?.end ?? 0)) kept.push(span);
  return kept;
};

/** One line of air text with its key words marked. Plain text when nothing matches. */
export const emphasizeAir = (line: string): TemplateResult => {
  const parts: (string | TemplateResult)[] = [];
  let at = 0;
  for (const { start, end, kind } of spansOf(line)) {
    if (start > at) parts.push(line.slice(at, start));
    parts.push(html`<b class=${kind}>${line.slice(start, end)}</b>`);
    at = end;
  }
  if (at < line.length) parts.push(line.slice(at));
  return html`${parts}`;
};

/** A mission result is every log sentence joined with a space; one sentence per line reads far better. */
export const airSentences = (text: string): readonly string[] => text.split(/(?<=\.) (?=[A-Z])/u).map((sentence) => sentence.trim()).filter(Boolean);
