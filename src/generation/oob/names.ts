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

export const unitName = (
  side: OobSide, role: OobUnitRole, ordinal: number, seed: number,
  formation?: FormationNameProfile,
): string => {
  const allied = side === 'ALLIED';
  const rng = createSeededRandom(mixUint32(seed ^ (allied ? 0x5155 : 0x4e53)));
  const number = rng.integer(200, 850) + ordinal;
  const label = (() => {
    switch (role) {
      case 'FORMATION_COMMAND': return allied ? 'HQ' : 'Stab';
      case 'COMBAT': {
        if (!formation) throw new Error('Combat names require a formation profile.');
        return fromPool(formation.combat, ordinal);
      }
      case 'ARTILLERY': return formation
        ? `${allied ? 'Divisional Artillery' : 'Divisions-Artillerie'} ${['I', 'II'][ordinal - 1]}`
        : `${number} ${allied ? 'Corps FA Bn' : 'Heeres-Artillerie-Abt.'}`;
      case 'RECONNAISSANCE': return formation?.recon.length
        ? fromPool(formation.recon, ordinal)
        : `${allied ? 'Recon Detachment' : 'Aufklärungs-Abteilung'} ${ordinal}`;
      case 'ENGINEER': return `${number} ${allied ? 'Engr Combat Bn' : 'Pionier-Btl.'}`;
      case 'TRANSPORT': return `${number} ${allied ? 'QM Truck Co' : 'Kraftfahr-Kp.'}`;
      case 'SUPPLY': return `${allied ? 'Army Supply Dump' : 'Heeres-Nachschublager'} ${number}`;
    }
  })();
  return formation ? `${label} / ${formation.name}` : `${allied ? 'US' : 'German'} ${label}`;
};
