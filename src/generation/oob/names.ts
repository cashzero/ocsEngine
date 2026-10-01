import { createSeededRandom, mixUint32 } from '../map/rng.js';
import { FORMATION_NAME_PROFILES, type FormationNameProfile } from './name-catalog.js';
import type { OobFormationArchetype, OobSide, OobUnitRole } from './model.js';

// Separate naming streams never consume the composition/deployment RNG.
export const formationNames = (seed: number, side: OobSide, archetype: OobFormationArchetype): readonly FormationNameProfile[] =>
  createSeededRandom(mixUint32(seed ^ (side === 'ALLIED' ? 0x5553 : 0x4745)))
    .shuffle(FORMATION_NAME_PROFILES.filter((profile) => profile.side === side && profile.archetype === archetype));

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
  const rng = createSeededRandom(mixUint32(seed ^ (allied ? 0x5155 : 0x4e53)));
  const number = rng.integer(200, 850) + ordinal;
  const label = (() => {
    switch (role) {
      case 'FORMATION_COMMAND': return allied ? 'HQ' : 'Stab';
      case 'COMBAT': {
        if (!formation) throw new Error('Combat names require a formation profile.');
        if (echelon === 'XX') return sizedCombatName('', echelon, allied, formation.name, ordinal);
        // Several battalions of one regiment become a single regiment name, so pool the regiments.
        const pool = echelon === 'III'
          ? [...new Set(formation.combat.map((entry) => sizedCombatName(entry, echelon, allied, formation.name, ordinal)))]
          : formation.combat;
        return fromPool(pool, ordinal);
      }
      case 'ARTILLERY': return formation
        ? `${allied ? 'Divisional Artillery' : 'Divisions-Artillerie'} ${['I', 'II'][ordinal - 1]}`
        : echelon === 'III'
          ? (allied ? `${number} FA Group` : `Artillerie-Regiment ${number}`)
          : `${number} ${allied ? 'Corps FA Bn' : 'Heeres-Artillerie-Abt.'}`;
      case 'RECONNAISSANCE': return formation?.recon.length
        ? fromPool(formation.recon, ordinal)
        : `${allied ? 'Recon Detachment' : 'Aufklärungs-Abteilung'} ${ordinal}`;
      case 'ENGINEER': return echelon === 'X'
        ? (allied ? `${number} Engr Combat Group` : `Pionier-Brigade ${number}`)
        : `${number} ${allied ? 'Engr Combat Bn' : 'Pionier-Btl.'}`;
      case 'TRANSPORT': return `${number} ${allied ? 'QM Truck Co' : 'Kraftfahr-Kp.'}`;
      case 'SUPPLY': return `${allied ? 'Army Supply Dump' : 'Heeres-Nachschublager'} ${number}`;
    }
  })();
  if (role === 'COMBAT' && echelon === 'XX') return label;
  return formation ? `${label} / ${formation.name}` : `${allied ? 'US' : 'German'} ${label}`;
};
