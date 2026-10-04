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

/** How many formations of an archetype both sides can give distinct names (the smaller name pool). */
export const formationNameCapacity = (archetype: OobFormationArchetype): number => Math.min(
  ...(['ALLIED', 'AXIS'] as const).map((side) => FORMATION_NAME_PROFILES
    .filter((profile) => profile.side === side && profile.archetype === archetype).length),
);

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

export interface HqName {
  /** The VASSAL entryName without its nation prefix ("HQ 3rd Corps" of "US HQ 3rd Corps"). */
  readonly name: string;
  /** What the counter prints rotated beside the flag (BTR S01 R10 C01 "3", S01 R10 C10 "18 Abn", S04 R12 C20 "39 Pz"). */
  readonly designation: string;
}

/** BTR names its HQs "HQ <n> Corps"; the pool lists each as [<n>, printed number]. */
const corpsHqs = (entries: readonly (readonly [string, string])[]): readonly HqName[] =>
  entries.map(([corps, designation]) => ({ name: `HQ ${corps} Corps`, designation }));

/**
 * HQ names from the BTR VASSAL module (US and Heer; SS and Luftwaffe HQs print different art and are left out). An HQ is an
 * independent unit (3.2f) that no formation contains; BTR's happen to be corps HQs, but nothing else assumes an HQ's level.
 * TODO(hq-values): a generated HQ prints its side's reviewed archetype values (US HQ 3rd Corps, GPID 319; Ge HQ 39th Pz
 * Corps, GPID 1103) whichever name it draws. User-visible impact: an HQ named after one whose real counter prints 8-0
 * throws as far as the archetype's 14-0 / 10-0. Closes when each pooled HQ's faces are transcribed into the counter
 * corpus and the HQ is built from its own GPID.
 */
const HQ_NAMES: Readonly<Record<OobSide, readonly HqName[]>> = {
  ALLIED: corpsHqs([['3rd', '3'], ['5th', '5'], ['6th', '6'], ['7th', '7'], ['8th', '8'], ['12th', '12'], ['13th', '13'],
    ['15th', '15'], ['16th', '16'], ['18th Abn', '18 Abn'], ['19th', '19'], ['20th', '20'], ['21st', '21'], ['22nd', '22']]),
  AXIS: corpsHqs([['39th Pz', '39 Pz'], ['47th Pz', '47 Pz'], ['58th Pz', '58 Pz'], ['12th', '12'], ['13th', '13'], ['30th', '30'],
    ['53rd', '53'], ['63rd', '63'], ['64th', '64'], ['66th', '66'], ['67th', '67'], ['74th', '74'], ['80th', '80'], ['81st', '81'],
    ['82nd', '82'], ['85th', '85'], ['86th', '86'], ['88th', '88'], ['89th', '89'], ['90th', '90'], ['Ems', 'Ems'], ['Hohne', 'Hohne']]),
};

/** The side's `ordinal`-th HQ (1-based), drawn from its own naming stream so it never consumes the composition RNG. */
export const hqName = (seed: number, side: OobSide, ordinal: number): HqName => {
  const pool = createSeededRandom(mixUint32(seed ^ (side === 'ALLIED' ? 0x4855 : 0x4847))).shuffle(HQ_NAMES[side]);
  return pool[(ordinal - 1) % pool.length]!;
};

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
      // An HQ keeps the module's name, "US HQ 3rd Corps" / "Ge HQ 39th Pz Corps".
      case 'HQ': return hqName(seed, side, ordinal).name;
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
      // A truck is a generic counter too: the board-game piece prints no name or number, only its size and MPs.
      case 'TRANSPORT': return 'Truck';
      // A supply dump is a generic counter with no name or number on the board-game piece; only its size matters.
      case 'SUPPLY': return 'Supply Dump';
      // Aircraft and Air Bases are named by the air generator.
      case 'AIRCRAFT': return `Air Group ${number}`;
      case 'AIR_BASE': return `Air Base ${number}`;
    }
  })();
  if ((role === 'COMBAT' && echelon === 'XX') || role === 'SUPPLY' || role === 'TRANSPORT') return label;
  return formation ? `${label} / ${formationName}` : `${allied ? 'US' : 'Ge'} ${label}`;
};
