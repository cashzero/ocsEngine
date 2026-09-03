import { mixUint32 } from './rng.js';

const fade = (value: number): number => value * value * (3 - 2 * value);
const lerp = (left: number, right: number, ratio: number): number => left + (right - left) * ratio;

const lattice = (x: number, y: number, seed: number): number => {
  const hash = mixUint32(seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495));
  return hash / 0xffff_ffff;
};
export const valueNoise2d = (x: number, y: number, seed: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  return lerp(
    lerp(lattice(x0, y0, seed), lattice(x0 + 1, y0, seed), tx),
    lerp(lattice(x0, y0 + 1, seed), lattice(x0 + 1, y0 + 1, seed), tx),
    ty,
  );
};

export const fractalNoise2d = (
  x: number,
  y: number,
  seed: number,
  octaves = 4,
): number => {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2d(x * frequency, y * frequency, seed + octave * 0x9e3779b9) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / weight;
};
