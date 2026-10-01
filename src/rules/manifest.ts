import { err, ok, type Result } from '../core/index.js';

/**
 * IMPLEMENTED: every cited rule is enforced and covered by tests.
 * PARTIAL: usable, but the listed gaps in `note` are knowingly missing (see AGENTS.md TODO policy).
 * DEFERRED / GAME_SPECIFIC / NOT_APPLICABLE: not available; callers must not approximate them.
 */
export type RuleSupportStatus = 'IMPLEMENTED' | 'PARTIAL' | 'DEFERRED' | 'GAME_SPECIFIC' | 'NOT_APPLICABLE';

export interface RuleFeatureManifestEntry {
  readonly id: string;
  readonly rules: readonly string[];
  readonly status: RuleSupportStatus;
  readonly owner: string;
  readonly actions: readonly string[];
  readonly queries: readonly string[];
  readonly tests: readonly string[];
  readonly note: string;
}

export interface RuleTableProvenance {
  readonly id: string;
  readonly rulesVersion: string;
  readonly sourceDocument: string;
  readonly locator: string;
  readonly sourceSha256: string;
  readonly reviewStatus: 'REVIEWED' | 'DEFERRED';
  readonly resolutionPriority: number;
}

const entry = (
  id: string,
  status: 'IMPLEMENTED' | 'PARTIAL',
  rules: readonly string[],
  owner: string,
  actions: readonly string[],
  queries: readonly string[],
  tests: readonly string[],
  note: string,
): RuleFeatureManifestEntry => ({ id, rules, status, owner, actions, queries, tests, note });

const deferred = (id: string, rules: readonly string[], owner: string, note: string): RuleFeatureManifestEntry =>
  ({ id, rules, status: 'DEFERRED', owner, actions: [], queries: [], tests: [], note });

const CONFORMANCE = 'ocs-conformance.test.ts';
const LOGISTICS = 'ocs-logistics.test.ts';

export const RULE_FEATURE_MANIFEST: readonly RuleFeatureManifestEntry[] = Object.freeze([
  entry('sequence.ground-turn', 'PARTIAL', ['2.1', '2.2', '2.3', '17.0'], 'rules/sequence', ['ADVANCE_SEQUENCE', 'RESPOND_DECISION'], ['SEQUENCE'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Both Player Turns with every phase and segment (including the Breakout Segment); weather is rolled on the game-specific Weather Table; First Player Determination rolls from turn 2 and the winner chooses; steps with no legal choice are passed automatically. GAP: the Aircraft Refit Phase is always empty because air power is deferred; the Variable Reinforcement Table and unit rebuilds (13.5) are not implemented.'),
  entry('weather', 'IMPLEMENTED', ['17.0'], 'rules/lifecycle', ['ADVANCE_SEQUENCE'], ['MOVEMENT_PATH'], [LOGISTICS],
    'Calendar date per Game Turn, one die on the dated Weather Table row ("Auto" rows need no roll), Mud and Snow TEC columns for movement, and normal costs for supply paths except where weather lowers them (12.3d, 17.0c). Flight conditions are not rolled: there are no air units in the ground game.'),
  entry('mode.transition', 'IMPLEMENTED', ['5.1-5.10'], 'rules/mode', ['CHANGE_MODE', 'RELEASE_RESERVE'], ['MODE_CHANGE'], [CONFORMANCE],
    'Voluntary changes only as a unit begins to move; Strat on the Move side; Reserve/Strat never entered in enemy ZOC; release removes the marker; DG/Exploit are involuntary and cleared at the owner\'s Clean Up; Reserve markers come off defenders that receive a combat result (5.7d).'),
  entry('stacking.ground', 'IMPLEMENTED', ['4.6', '4.8'], 'rules/stacking', ['RESPOND_DECISION'], ['STACKING'], [CONFORMANCE, LOGISTICS],
    '10 RE per Hex is checked when a segment or phase ends (not while moving, and not in the Reinforcement Phase); the overstacked side, acting or not, eliminates units of its choice; retreats may end overstacked; overrun stacks are limited; opposing combat units never share a Hex.'),
  entry('zoc.purpose', 'IMPLEMENTED', ['4.4', '4.5'], 'rules/zoc', [], ['ZOC'], [CONFORMANCE],
    'Combat Mode Attack-Capable units in supply exert ZOC; Truck movement stops (Leg/Track do not); friendly combat units negate Truck movement and Truck supply paths and are then locked for the phase; Reserve/Strat entry and retreats are never negated.'),
  entry('movement.ground', 'PARTIAL', ['6.1-6.3'], 'rules/movement', ['MOVE_PIECE'], ['MOVEMENT_PATH', 'MOVEMENT_CANDIDATES'], [CONFORMANCE, LOGISTICS, 'movement-tec.test.ts'],
    'Mobility-typed TEC costs by ground condition, road override, most-costly terrain, prohibited and All terrain, symmetric legality, minimum move, one unit at a time (6.1g), phase eligibility (7.0a/11.0a), mode allowances, and fuel (12.5). GAP: units move individually; moving stacks together (6.1f) was postponed at the user\'s request.'),
  entry('supply.trace-and-draw', 'PARTIAL', ['12.3', '12.4', '12.6', '12.8', '12.10', '13.1d'], 'rules/supply', ['CHECK_SUPPLY', 'RECOVER_INTERNALS', 'CHOOSE_FORMATION_TRACE', 'ATTEMPT_BREAKOUT'], ['SUPPLY'], [CONFORMANCE, LOGISTICS],
    'Draw (5 Truck MP) and HQ throw (printed MP range; divisional HQs only to their division and independents) counted like movement; trace to Supply Sources and Extenders; a multi-unit formation traces through one HQ or source of the player\'s choice; eating off the map at 1T per 2 RE; Out of Supply marking, Attrition Table rolls with the owner choosing losses, and Breakout; internal stocks (Low/Exhausted, mandatory and partial recovery, used only when on-map SP is short). GAP: detrainable hexes (13.3c) do not exist because railroads are deferred.'),
  entry('supply.fuel', 'IMPLEMENTED', ['12.5'], 'rules/supply', ['PAY_FUEL'], ['MOVEMENT_PATH'], [LOGISTICS],
    'Truck and Track combat units spend no MP (or overrun) until fueled by the Formation Method (1 SP, the units reached through one route), the HQ Method (1 SP, the HQ and independents in its throw range, one throw location per phase), or the Single-Unit Method (1T, this phase); Formation and HQ fuel last until the owner\'s Clean Up; retreats and advances need none.'),
  entry('transport.trucks', 'IMPLEMENTED', ['12.1b', '12.2a', '12.7', '12.11a', '13.2', '9.14b-d'], 'rules/supply', ['LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'COMBINE_TRANSPORT', 'DIVIDE_TRANSPORT', 'FORM_EXTENDER', 'DISSOLVE_EXTENDER', 'COLLAPSE_EXTENDER', 'BLOW_DUMP'], ['SUPPLY'], [LOGISTICS],
    'Transport Points load and unload at 10% of MA, carry their size in SP usable aboard, combine and divide within the five-point counter mix, and never re-load SP unloaded the same phase; five points form an Extender (half MA, must connect, range 20 Truck MP) that is a supply source and collapses when entered; dumps can be blown once per phase; captured dumps and trucks follow the Capture Table and the owner places displaced trucks. Generated games have no Organic Trucks or wagons.'),
  entry('combat.ground', 'IMPLEMENTED', ['9.1-9.14'], 'rules/combat', ['DECLARE_COMBAT', 'RESPOND_DECISION', 'CANCEL_TRANSACTION'], ['COMBAT'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Whole-hex defence, multi-hex attacks, attacker 1T/step and defender 2T/1T combat supply paid from dumps the owner picks (internal stocks when on-map SP is short), class and AT terrain modifiers, the defender\'s announced terrain for his stack and line, OCS odds rounding, AR DRM, Surprise, the v4.3 Combat Table, losses/options/exploits, retreats to destinations the owner picks (together, split, or with non-attacking tagalongs), DG and enemy-ZOC effects, advance by any subset, and dump/truck capture. Each attacking stack gets the terrain that weakens it most (9.4b): that pick only lowers the attack, so it is always the defender\'s best and is not asked.'),
  entry('overrun.ground', 'IMPLEMENTED', ['8.0', '8.1', '12.5b'], 'rules/combat', ['DECLARE_COMBAT'], ['COMBAT'], [CONFORMANCE, LOGISTICS],
    '3 MP per overrun, at least 3 MP left, entry cost 3 MP or less without roads, no DG attackers, Combat/Move/Exploit modes, units that started the phase together, fuel required, mandatory entry after success, no exploit results.'),
  entry('barrage.artillery', 'PARTIAL', ['10.0', '10.1', '13.4'], 'rules/combat', ['DECLARE_BARRAGE', 'RESPOND_DECISION', 'CANCEL_TRANSACTION'], ['BARRAGE'], [CONFORMANCE, LOGISTICS],
    'v4.3 Barrage Table with cost from the initial column paid through one HQ or one dump of the player\'s choice (never internal stocks), density with a 3 RE cap per formation, terrain (the largest left shift, always the target\'s best pick), spotter and Strat shifts, [1/2] and 1/2 results, one barrage per Hex and per unit each phase, Reserve/Strat exclusion, and phase limits. GAP: hedgehog shifts and the Barrage vs Facility Table are unused because hedgehogs, air bases and ports (16.0, 15.0, 19.0) are deferred.'),
  entry('lifecycle.ground', 'PARTIAL', ['2.3', '5.10', '13.6'], 'rules/lifecycle', ['PLACE_REINFORCEMENT', 'ADVANCE_SEQUENCE'], ['VICTORY'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Reinforcements and Supply Table SP must be placed on arrival (at the nearest open map-edge Hex when an entry is blocked) and may overstack; units that broke out return on their turn; Clean Up; control; turn limit and objective scoring. GAP: the Variable Reinforcement Table, rebuilds and replacements (13.5) are not implemented.'),
  deferred('replacements-rebuilds', ['13.5', '13.9'], 'rules/lifecycle', 'Generated games have no Variable Reinforcement Table or rebuild points.'),
  deferred('hedgehogs-engineering', ['13.8', '16.0'], 'rules/combat', 'Engineers cannot bridge, build hedgehogs or create detrainable hexes.'),
  deferred('movement.rail-sea-air', ['13.3', '14.9', '19.0'], 'rules/movement', 'Transport networks require game-specific capacity data.'),
  deferred('air-power', ['14.0-15.0'], 'rules/air', 'Outside the ground/logistics scope.'),
  deferred('naval-shipping', ['18.0-19.0'], 'rules/naval', 'Outside the ground/logistics scope.'),
  deferred('optional-rules', ['21.1-21.12'], 'rules/optional', 'Each optional rule needs an explicit configuration contract.'),
  { id: 'victory.game-table', rules: ['game-specific'], status: 'GAME_SPECIFIC', owner: 'rules/victory', actions: [], queries: ['VICTORY'], tests: ['rule-engine-integration.test.ts'], note: 'Generic turn/objective adapter; scenario-specific VP tables are data.' },
]);

const V43_CHARTS = 'Beyond the Rhine VASSAL module 1.27.0, images/v4.3 Charts (final)-';

export const RULE_TABLE_PROVENANCE: readonly RuleTableProvenance[] = Object.freeze([
  {
    id: 'table:ocs-4.3-combat', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}3 1000.png`, locator: 'Combat Table (9.9)',
    sourceSha256: '5484b15276d54a8afd1896692671b6b56a6d0694162d20fbdce39542e16aa96a',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:ocs-4.3-surprise-and-combat-supply', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}2 1000.png`, locator: 'Surprise Rolls (9.8), Combat Supply (9.5)',
    sourceSha256: '0e5b8282b953d8bf389f3461ada4e30bee4ea8897e34390c031ee47d1cc3ad32',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:ocs-4.3-attrition-capture-blowing', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}2 1000.png`, locator: 'Attrition Table (12.8b), Capture Table (9.14b/c), Dump Blowing (12.11a)',
    sourceSha256: '0e5b8282b953d8bf389f3461ada4e30bee4ea8897e34390c031ee47d1cc3ad32',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:btr-weather', rulesVersion: 'Beyond the Rhine',
    sourceDocument: 'Beyond the Rhine VASSAL module 1.27.0, images/BTR Weather Table.jpg', locator: 'Weather Table, Ground Conditions',
    sourceSha256: '3ba45897450e339c22557e526890e14288d540fe81f65d9db0db2373259ed52f',
    reviewStatus: 'REVIEWED', resolutionPriority: 200,
  },
  {
    id: 'table:btr-supply', rulesVersion: 'Beyond the Rhine',
    sourceDocument: 'Beyond the Rhine VASSAL module 1.27.0, images/BTR Axis Supply.jpg', locator: 'German Supply Table (column = formations per side in generated games)',
    sourceSha256: 'e4167413c9bd95cabf5fdca33a60ea1abad401e1144813d62f59ef66eb6865fd',
    reviewStatus: 'REVIEWED', resolutionPriority: 200,
  },
  {
    id: 'table:ocs-4.3-barrage', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}4 1000.png`, locator: 'Barrage Table (10.0a), density and additional shifts',
    sourceSha256: '69b711ebb28640f9c2262677c8a7595b75765e7b130ec7dfc1b61818abbd94c9',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:btr-terrain-effects-on-combat', rulesVersion: 'Beyond the Rhine',
    sourceDocument: 'Beyond the Rhine VASSAL module 1.27.0, images/BTR TEC.jpg', locator: 'Terrain Effects on Combat',
    sourceSha256: '70ca1a8564a6527db668fd5c347d423ec81384d45a7a7628162286b1b513a770',
    reviewStatus: 'REVIEWED', resolutionPriority: 200,
  },
  {
    id: 'table:btr-terrain-effects-on-movement', rulesVersion: 'Beyond the Rhine',
    sourceDocument: 'BTR_TEC_jp.pdf page 2 (user supplied)', locator: 'Terrain Effects on Movement, Normal',
    sourceSha256: '2a51331aae3b6e816353c80f3156c7a01df6dc035944374b9fd0eecba54dd0e9',
    reviewStatus: 'REVIEWED', resolutionPriority: 200,
  },
  {
    id: 'table:scenario-victory', rulesVersion: 'game-specific',
    sourceDocument: 'ScenarioDefinition configuration', locator: 'victory adapter',
    sourceSha256: 'sha256:not-applicable-data-driven', reviewStatus: 'DEFERRED',
    resolutionPriority: 200,
  },
]);

export interface UnsupportedRuleFeatureError {
  readonly code: 'UNSUPPORTED_RULE_FEATURE';
  readonly featureId: string;
  readonly status: RuleSupportStatus | 'UNKNOWN';
  readonly message: string;
}

/** IMPLEMENTED and PARTIAL features are available; the entry's note lists a PARTIAL feature's gaps. */
export const requireImplementedRuleFeature = (
  featureId: string,
): Result<RuleFeatureManifestEntry, UnsupportedRuleFeatureError> => {
  const feature = RULE_FEATURE_MANIFEST.find(({ id }) => id === featureId);
  return feature?.status === 'IMPLEMENTED' || feature?.status === 'PARTIAL'
    ? ok(feature)
    : err({
      code: 'UNSUPPORTED_RULE_FEATURE',
      featureId,
      status: feature?.status ?? 'UNKNOWN',
      message: feature
        ? `${featureId} is ${feature.status}: ${feature.note}`
        : `Rule feature ${featureId} is not declared in the manifest.`,
    });
};
