import { createSeededRandom, mixUint32 } from '../map/rng.js';
import { FORMATION_NAME_PROFILES, type FormationNameProfile } from './name-catalog.js';
import type { OobFormationArchetype, OobSide, OobUnitRole } from './model.js';

const SERIES_ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^US (\d+)(?:st|nd|rd|th) Infantry Division/u, '$1.Inf'],
  [/^US (\d+)(?:st|nd|rd|th) Armored Division/u, '$1.A'],
  [/^US (\d+)(?:st|nd|rd|th) Airborne Division/u, '$1.Abn'],
  [/^(\d+)\. SS Panzer-Division/u, '$1.SS'],
  [/^(\d+)\. Panzer-Division/u, '$1.Pz'],
  [/^(\d+)\. Panzergrenadier-Division/u, '$1.PG'],
  [/^(\d+)\. Volksgrenadier-Division/u, '$1.VG'],
  [/^(\d+)\. Infanterie-Division/u, '$1.Inf'],
  [/^(\d+)\. Fallschirmjäger-Division/u, '$1.FJ'],
  [/^Panzer Lehr Division/u, 'Pz Lehr'],
  [/^Führer-Begleit-Brigade/u, 'FBB'],
  [/^Führer-Grenadier-Brigade/u, 'FGB'],
];

/**
 * The short designation printed on a counter ("82.Abn", "12.SS", "3.PG"), not the full formation title or
 * nickname. Names already in short form pass through unchanged.
 */
export const shortFormationName = (name: string): string => {
  for (const [pattern, replacement] of SERIES_ABBREVIATIONS) {
    if (pattern.test(name)) return name.replace(pattern, replacement).replace(/ ".*$/u, '').trim();
  }
  return name.replace(/ "[^"]*"/gu, '').trim();
};

// Separate naming streams never consume the composition/deployment RNG. Formation names are the short forms.
export const formationNames = (seed: number, side: OobSide, archetype: OobFormationArchetype): readonly FormationNameProfile[] =>
  createSeededRandom(mixUint32(seed ^ (side === 'ALLIED' ? 0x5553 : 0x4745)))
    .shuffle(FORMATION_NAME_PROFILES.filter((profile) => profile.side === side && profile.archetype === archetype))
    .map((profile) => ({ ...profile, name: shortFormationName(profile.name) }));

const fromPool = (pool: readonly string[], ordinal: number): string => {
  const name = pool[(ordinal - 1) % pool.length]!;
  // Small reference packages supply explicitly synthetic extra detachments at LARGE scale.
  return ordinal <= pool.length ? name : `${name} (Det. ${Math.ceil(ordinal / pool.length)})`;
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * Keep the unit-size word consistent with the counter's echelon symbol: battalion names
 * ("I/914 Inf Bn") become their regiment ("914 Inf Rgt") on a III counter, and a XX counter is
 * named after its division.
 */
export const sizedCombatName = (name: string, echelon: string, allied: boolean, formationName: string, ordinal: number): string => {
  // A division counter is the whole division.
  if (echelon === 'XX') return ordinal === 1 ? formationName : `${formationName} (group ${ROMAN[ordinal - 1] ?? ordinal})`;
  if (echelon !== 'III') return name;
  const detachment = / \(Det\. \d+\)$/u.exec(name)?.[0] ?? '';
  const core = name.slice(0, name.length - detachment.length).replace(/ \(-\)$/u, '');
  const regiment = core.split('/').at(-1)!.replace(/\b(Bn|Btl\.|Abt\.)$/u, allied ? 'Regt' : 'Rgt');
  return `${regiment}${detachment}`;
};

export const unitName = (
  side: OobSide, role: OobUnitRole, ordinal: number, seed: number,
  formation?: FormationNameProfile, echelon = '',
): string => {
  const allied = side === 'ALLIED';
  const formationName = formation ? shortFormationName(formation.name) : '';
  const rng = createSeededRandom(mixUint32(seed ^ (allied ? 0x5155 : 0x4e53)));
  const number = rng.integer(200, 850) + ordinal;
  const label = (() => {
    switch (role) {
      case 'FORMATION_COMMAND': return allied ? 'HQ' : 'Stab';
      case 'COMBAT': {
        if (!formation) throw new Error('Combat names require a formation profile.');
        if (echelon === 'XX') return sizedCombatName('', echelon, allied, formationName, ordinal);
        // Several battalions of one regiment become a single regiment name, so pool the regiments.
        const pool = echelon === 'III'
          ? [...new Set(formation.combat.map((entry) => sizedCombatName(entry, echelon, allied, formationName, ordinal)))]
          : formation.combat;
        return fromPool(pool, ordinal);
      }
      case 'ARTILLERY': return formation
        ? `Div Arty ${['I', 'II'][ordinal - 1]}`
        : echelon === 'III'
          ? (allied ? `${number} FA Gp` : `Arty Rgt ${number}`)
          : `${number} ${allied ? 'Corps FA Bn' : 'H.Arty Abt'}`;
      case 'RECONNAISSANCE': return formation?.recon.length
        ? fromPool(formation.recon, ordinal)
        : `${allied ? 'Rcn Det' : 'Aufkl Abt'} ${ordinal}`;
      case 'ENGINEER': return echelon === 'X'
        ? (allied ? `${number} Engr Gp` : `Pi Bde ${number}`)
        : `${number} ${allied ? 'Engr Bn' : 'Pi Bn'}`;
      case 'TRANSPORT': return `${number} ${allied ? 'Truck Co' : 'Kfz-Kp'}`;
      // A supply dump is a generic counter with no name or number on the board-game piece; only its size matters.
      case 'SUPPLY': return 'Supply Dump';
      // Aircraft and Air Bases are named by the air generator.
      case 'AIRCRAFT': return `Air Group ${number}`;
      case 'AIR_BASE': return `Air Base ${number}`;
    }
  })();
  if ((role === 'COMBAT' && echelon === 'XX') || role === 'SUPPLY') return label;
  return formation ? `${label} / ${formationName}` : `${allied ? 'US' : 'Ge'} ${label}`;
};
