import { describe, expect, it } from 'vitest';
import { FORMATION_NAME_PROFILES } from '../../src/generation/oob/name-catalog.js';
import { formationNames, unitName } from '../../src/generation/oob/names.js';

describe('WWII OOB naming references', () => {
  it('makes the expanded pools reachable across seeds without duplicate formations', () => {
    expect(FORMATION_NAME_PROFILES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(FORMATION_NAME_PROFILES.map(({ name }) => name)).size).toBe(FORMATION_NAME_PROFILES.length);
    for (const side of ['ALLIED', 'AXIS'] as const) {
      // Allies field no mobile-infantry packages (their mobile slot is airborne); the Axis field both.
      for (const archetype of (side === 'ALLIED' ? ['ARMORED', 'INFANTRY', 'AIRBORNE'] : ['ARMORED', 'INFANTRY', 'MOBILE_INFANTRY', 'AIRBORNE']) as readonly ('ARMORED' | 'INFANTRY' | 'MOBILE_INFANTRY' | 'AIRBORNE')[]) {
        const pool = FORMATION_NAME_PROFILES.filter((profile) => profile.side === side && profile.archetype === archetype);
        expect(pool.length).toBeGreaterThanOrEqual(4);
        const seen = new Set<string>();
        for (let seed = 0; seed < 256; seed += 1) {
          const ordered = formationNames(seed, side, archetype);
          expect(ordered).toEqual(formationNames(seed, side, archetype));
          expect(new Set(ordered.map(({ name }) => name)).size).toBe(pool.length);
          seen.add(ordered[0]!.name);
        }
        expect([...seen].sort()).toEqual(pool.map(({ name }) => name).sort());
      }
    }
  });

  it('keeps subordinate identities tied to their parent at every supported scale', () => {
    for (const profile of FORMATION_NAME_PROFILES) {
      const combat = Array.from({ length: 4 }, (_, index) => unitName(profile.side, 'COMBAT', index + 1, 1944, profile));
      expect(new Set(combat).size).toBe(4);
      for (const name of combat) {
        expect(name.endsWith(` / ${profile.name}`)).toBe(true);
        expect(profile.combat.some((source) => name.startsWith(`${source} /`) || name.startsWith(`${source} (Det.`))).toBe(true);
        expect(name).not.toMatch(/undefined|NaN/);
      }
      const recon = unitName(profile.side, 'RECONNAISSANCE', 1, 1944, profile);
      if (profile.recon.length) expect(recon).toBe(`${profile.recon[0]} / ${profile.name}`);
      expect(unitName(profile.side, 'ARTILLERY', 1, 1944, profile))
        .not.toEqual(unitName(profile.side, 'ARTILLERY', 2, 1944, profile));
    }
  });

  it('uses the source regiment and reconnaissance numbers instead of formation slot arithmetic', () => {
    const profile = FORMATION_NAME_PROFILES.find(({ name }) => name === 'US 2nd Armored Division "Hell on Wheels"')!;
    expect(unitName('ALLIED', 'COMBAT', 1, 1944, profile)).toBe(`1/66 Arm Bn / ${profile.name}`);
    expect(unitName('ALLIED', 'RECONNAISSANCE', 1, 1944, profile)).toBe(`82 Recon Bn / ${profile.name}`);
    expect(unitName('ALLIED', 'TRANSPORT', 1, 7)).not.toEqual(unitName('ALLIED', 'TRANSPORT', 1, 8));
  });
});
