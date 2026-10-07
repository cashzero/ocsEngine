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
  /** The HQ's own BTR PieceSlot; its faces (range-MA per mode, echelon) are transcribed in the counter corpus. */
  readonly gpid: number;
}

/** BTR names its HQs "HQ <n> Corps"; the pool lists each as [<n>, printed number, GPID]. */
const corpsHqs = (entries: readonly (readonly [string, string, number])[]): readonly HqName[] =>
  entries.map(([corps, designation, gpid]) => ({ name: `HQ ${corps} Corps`, designation, gpid }));

/**
 * HQs of the BTR VASSAL module (US and Heer; SS and Luftwaffe HQs print different art and are left out). An HQ is an
 * independent unit (3.2f) that no formation contains; BTR's happen to be corps HQs, but nothing else assumes an HQ's level.
 * Each is built from its own GPID, so it prints its own counter's values (US 14-0 / 9-16, 18th Abn 8-0 / 6-16; German
 * panzer corps 10-0 / 7-14, other corps 8-0 / 5-10).
 */
const HQ_NAMES: Readonly<Record<OobSide, readonly HqName[]>> = {
  ALLIED: corpsHqs([['3rd', '3', 319], ['5th', '5', 320], ['6th', '6', 1724], ['7th', '7', 322], ['8th', '8', 323], ['12th', '12', 324],
    ['13th', '13', 325], ['15th', '15', 326], ['16th', '16', 327], ['18th Abn', '18 Abn', 328], ['19th', '19', 335], ['20th', '20', 336],
    ['21st', '21', 337], ['22nd', '22', 338]]),
  AXIS: corpsHqs([['39th Pz', '39 Pz', 1103], ['47th Pz', '47 Pz', 1104], ['58th Pz', '58 Pz', 1105], ['12th', '12', 1106],
    ['13th', '13', 1107], ['30th', '30', 1108], ['53rd', '53', 1109], ['63rd', '63', 1110], ['64th', '64', 1111], ['66th', '66', 1112],
    ['67th', '67', 1113], ['74th', '74', 1114], ['80th', '80', 1115], ['81st', '81', 1116], ['82nd', '82', 1117], ['85th', '85', 1118],
    ['86th', '86', 1119], ['88th', '88', 1120], ['89th', '89', 1121], ['90th', '90', 1122], ['Ems', 'Ems', 1123], ['Hohne', 'Hohne', 1124]]),
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

/** Battalion numbers printed on BTR 1.27.0 PieceSlots ("US 745 Tk Bn", "US 803 TD Bn", "Ge 243 AG Bn", "Ge 1 PJ Bn"). */
const US_TANK_BATTALIONS = [70, 101, 191, 701, 702, 707, 709, 712, 717, 735, 736, 737, 740, 741, 745, 746, 747, 748, 749, 750, 753, 756, 761, 771, 772, 774, 777, 778, 781, 782, 784, 786, 787];
const US_TANK_DESTROYER_BATTALIONS = [601, 602, 603, 605, 607, 609, 610, 612, 614, 628, 629, 630, 633, 634, 635, 636, 638, 643, 644, 645, 648, 654, 656, 661, 679, 691, 692, 702, 703, 704, 705, 771, 772, 773, 774, 776, 801, 802, 803, 807, 808, 809, 811, 813, 814, 817, 818, 820, 821, 822, 823, 824, 825, 827, 893, 899];
const GERMAN_ASSAULT_GUN_BATTALIONS = [243, 244, 280, 341, 394, 667, 902, 905];
const GERMAN_PANZERJAGER_BATTALIONS = [1, 93, 468, 483, 484, 485, 486, 487, 501, 502, 503, 504, 512, 519, 559, 560, 653, 654, 655, 657, 668, 681, 682, 683, 686, 708, 741];

/** German heavy tank units printed in BTR 1.27.0 ("Ge 506 Tgr Bn", "Ge 3-510 Tgr Coy", "Ge 3-511 Tgr Coy"). */
const GERMAN_TIGER_UNITS = [506, 510, 511];

/** A balancing German heavy tank battalion's name. */
export const tigerBattalionName = (seed: number, ordinal: number): string => `Ge ${pickBattalion(GERMAN_TIGER_UNITS, seed, ordinal, false)} Tgr Bn`;

/** The `ordinal`-th distinct number of a seeded shuffle of `pool`; past the pool's size numbers repeat with a suffix. */
const pickBattalion = (pool: readonly number[], seed: number, ordinal: number, allied: boolean): string => {
  const order = createSeededRandom(mixUint32(seed ^ pool.length ^ (allied ? 0x544b : 0x4147))).shuffle(pool);
  const index = (ordinal - 1) % order.length;
  const round = Math.floor((ordinal - 1) / order.length);
  return `${order[index]!}${round > 0 ? `-${round + 1}` : ''}`;
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
      // Independent battalions take a number the module itself prints for that kind of unit, drawn per seed.
      case 'TANK': return `${pickBattalion(allied ? US_TANK_BATTALIONS : GERMAN_ASSAULT_GUN_BATTALIONS, seed, ordinal, allied)} ${allied ? 'Tk Bn' : 'AG Bn'}`;
      case 'ANTI_TANK': return `${pickBattalion(allied ? US_TANK_DESTROYER_BATTALIONS : GERMAN_PANZERJAGER_BATTALIONS, seed, ordinal, allied)} ${allied ? 'TD Bn' : 'PJ Bn'}`;
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

/**
 * What a counter prints rotated beside its symbol: the unit's own number, read from its name ("22 Arm Regt" 22,
 * "I/16 Pz Bn" I/16, "Ge Arty Rgt 600" 600, "Div Arty II" II, "Alanis TF" Alanis, division "101.Abn" 101), and the
 * short name of the division it belongs to ("22 Arm Regt / 11.A" prints 11.A). A name without a number (a supply dump,
 * "FB Pz Rgt") prints nothing: the generator's own ids are never shown to the player.
 */
export const counterIdentification = (name: string, inFormation: boolean): { readonly designation: string; readonly affiliation: string } => {
  const split = name.lastIndexOf(' / ');
  const affiliation = inFormation && split >= 0 ? name.slice(split + 3) : '';
  const own = (split >= 0 ? name.slice(0, split) : name).replace(/^(US|Ge) /u, '').replace(/ \(Det\. \d+\)$/u, '');
  const words = own.split(' ');
  const numbered = words.find((word) => /\d/u.test(word));
  if (numbered) return { designation: /^\d+\./u.test(numbered) ? numbered.slice(0, numbered.indexOf('.')) : numbered, affiliation };
  if (/ (TF|KG)$/u.test(own)) return { designation: words[0]!, affiliation };
  const last = words.at(-1)!;
  return { designation: ROMAN.includes(last) ? last : '', affiliation };
};
