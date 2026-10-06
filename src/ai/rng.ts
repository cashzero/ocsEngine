import type { BotRng } from './model.js';

/** 32-bit FNV-1a over text: mixes the seat seed with the state hash. */
const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Random numbers for one decision, derived from the seat seed, the state hash and how many decisions this seat
 * already made in that state. Nothing is stored: the same position always yields the same choices, through
 * undo, save/load and replay, and the rules dice are never touched.
 */
export const createBotRng = (seed: number, stateHash: string, ordinal: number): BotRng => {
  let state = fnv1a(`${seed >>> 0}|${stateHash}|${ordinal}`) || 0x9e3779b9;
  const next = (): number => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  const index = (size: number): number => Math.min(size - 1, Math.floor(next() * size));
  const weighted: BotRng['weighted'] = (entries) => {
    const total = entries.reduce((sum, { weight }) => sum + Math.max(0, weight), 0);
    if (!(total > 0)) return null;
    let cursor = next() * total;
    for (const entry of entries) {
      cursor -= Math.max(0, entry.weight);
      if (cursor < 0) return entry.value;
    }
    // Rounding left the cursor at the end: the last entry that can be drawn.
    for (let index = entries.length - 1; index >= 0; index -= 1) if (entries[index]!.weight > 0) return entries[index]!.value;
    return null;
  };
  return { next, index, weighted };
};
