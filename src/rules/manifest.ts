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
const AIR = 'ocs-air.test.ts';
const AIR_TRANSPORT = 'ocs-air-transport.test.ts';
const AIR_SUPPORT = 'ocs-air-support.test.ts';
const REPLACEMENTS = 'ocs-replacements.test.ts';

export const RULE_FEATURE_MANIFEST: readonly RuleFeatureManifestEntry[] = Object.freeze([
  entry('sequence.ground-turn', 'PARTIAL', ['2.1', '2.2', '2.3', '17.0'], 'rules/sequence', ['ADVANCE_SEQUENCE', 'RESPOND_DECISION'], ['SEQUENCE'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Both Player Turns with every phase and segment (including the Breakout Segment); weather is rolled on the game-specific Weather Table; First Player Determination rolls from turn 2 and the winner chooses; steps with no legal choice are passed automatically. The Aircraft Refit Phase stops when an Air Base can refit. GAP: the Variable Reinforcement Table is not implemented; Pax and Eq arrive as a fixed allotment (replacements-rebuilds).'),
  entry('weather', 'IMPLEMENTED', ['17.0'], 'rules/lifecycle', ['ADVANCE_SEQUENCE'], ['MOVEMENT_PATH'], [LOGISTICS],
    'Calendar date per Game Turn, one die on the dated Weather Table row ("Auto" rows need no roll), Mud and Snow TEC columns for movement, and normal costs for supply paths except where weather lowers them (12.3d, 17.0c). GAP: Flight Conditions are not rolled; the Weather Table flight effects are game-specific rules left out as the user requested, so weather never restricts air missions.'),
  entry('mode.transition', 'IMPLEMENTED', ['5.1-5.10'], 'rules/mode', ['CHANGE_MODE', 'RELEASE_RESERVE'], ['MODE_CHANGE'], [CONFORMANCE],
    'Voluntary changes only as a unit begins to move; Strat on the Move side; Reserve/Strat never entered in enemy ZOC; release removes the marker; DG/Exploit are involuntary and cleared at the owner\'s Clean Up; Reserve markers come off defenders that receive a combat result (5.7d).'),
  entry('stacking.ground', 'IMPLEMENTED', ['4.6', '4.8'], 'rules/stacking', ['RESPOND_DECISION'], ['STACKING'], [CONFORMANCE, LOGISTICS],
    '10 RE per Hex is checked when a segment or phase ends (not while moving, and not in the Reinforcement Phase); the overstacked side, acting or not, eliminates units of its choice; retreats may end overstacked; overrun stacks are limited; opposing combat units never share a Hex.'),
  entry('zoc.purpose', 'IMPLEMENTED', ['4.4', '4.5'], 'rules/zoc', [], ['ZOC'], [CONFORMANCE],
    'Combat Mode Attack-Capable units in supply exert ZOC; Truck movement stops (Leg/Track do not); friendly combat units negate Truck movement and Truck supply paths and are then locked for the phase; Reserve/Strat entry and retreats are never negated.'),
  entry('movement.ground', 'PARTIAL', ['6.1-6.3'], 'rules/movement', ['MOVE_PIECE', 'END_MOVE'], ['MOVEMENT_PATH', 'MOVEMENT_CANDIDATES'], [CONFORMANCE, LOGISTICS, 'movement-tec.test.ts'],
    'Mobility-typed TEC costs by ground condition, road override, most-costly terrain, prohibited and All terrain, symmetric legality, minimum move, one unit at a time (6.1g), phase eligibility (7.0a/11.0a), mode allowances, and fuel (12.5); the current mover may be declared finished without starting another unit (6.1g). GAP: units move individually; moving stacks together (6.1f) was postponed at the user\'s request.'),
  entry('supply.trace-and-draw', 'PARTIAL', ['12.3', '12.4', '12.6', '12.8', '12.10', '13.1d'], 'rules/supply', ['CHECK_SUPPLY', 'RECOVER_INTERNALS', 'CHOOSE_FORMATION_TRACE', 'ATTEMPT_BREAKOUT'], ['SUPPLY'], [CONFORMANCE, LOGISTICS],
    'Draw (5 Truck MP) and HQ throw (printed MP range; divisional HQs only to their division and independents, which never include multi-unit formation members or multi-step units such as a single-counter infantry division, 3.2f) counted like movement; trace to Supply Sources and Extenders; a multi-unit formation traces through one HQ or one source (all map-edge sources count as one; the route covering most members is picked automatically and members off it feed from dumps or go Out of Supply, with no player choice); eating off the map at 1T per 2 RE; Out of Supply marking, Attrition Table rolls with the owner choosing losses, and Breakout; internal stocks (Low/Exhausted, mandatory and partial recovery, used only when on-map SP is short). Supply Sources include detrainable rail hexes (supply.rail-trace). GAP: 12.6f lets the owner select which part of a formation traces for free; here the route covering most members is always picked, with no player choice.'),
  entry('supply.rail-trace', 'PARTIAL', ['6.2a', '12.6a', '12.6b', '12.7a', '12.7g', '13.3c', '13.3h', '13.8c'], 'rules/supply', ['MOVE_PIECE', 'FORM_EXTENDER'], ['SUPPLY'], [LOGISTICS, 'ocs-rail-supply.test.ts', 'rail-supply-flow.test.ts'],
    'Railroads (single- and multi-track hexside features named by the rule configuration) are roads for movement at the BtR Railroad cost. Supply Sources are the scenario\'s map-edge railroad entry hexes, every detrainable hex, and linked Extenders: a rail hex is detrainable when it has a village or city (or a friendly HQ in Combat Mode, or DG oriented to Combat, 13.8c), the player controls it, and a rail path runs back to a source without entering an enemy combat unit, an un-negated enemy ZOC, or a station the player does not control (13.3h). An Extender joins the rail hexes in or next to its hex to its source, so the line beyond becomes detrainable (12.7a B/C). Initial control of rail hexes follows the deployment zones (the objective starts uncontrolled); control changes when a unit enters. Map-edge sources carry an S disc in the owning side colour; the Trace Supply overlay tags a seat\'s own detrainable sources RAIL and its linked Extenders EXT. GAP: (TODO rail-front-control) control never changes because a hex is "clearly" on the enemy side of the front line without being entered (13.3h second clause); generated games have one gauge, so Railheads, Wrong Gauge, rail conversion and Rail Repair units (13.3d, 13.3f, 13.3g) do not exist; there are no ports, so no port is detrainable.'),
  entry('supply.fuel', 'IMPLEMENTED', ['12.5'], 'rules/supply', ['PAY_FUEL'], ['MOVEMENT_PATH'], [LOGISTICS],
    'Truck and Track combat units spend no MP (or overrun) until fueled by the Formation Method (1 SP, the units reached through one route), the HQ Method (1 SP, the HQ and independents in its throw range, never a multi-step unit, one throw location per phase), or the Single-Unit Method (1T, this phase); Formation and HQ fuel last until the owner\'s Clean Up; retreats and advances need none.'),
  entry('transport.trucks', 'IMPLEMENTED', ['12.1b', '12.2a', '12.7', '12.11a', '13.2', '9.14b-d'], 'rules/supply', ['LOAD_SUPPLY', 'UNLOAD_SUPPLY', 'COMBINE_TRANSPORT', 'DIVIDE_TRANSPORT', 'FORM_EXTENDER', 'DISSOLVE_EXTENDER', 'COLLAPSE_EXTENDER', 'BLOW_DUMP'], ['SUPPLY'], [LOGISTICS],
    'Transport Points load and unload at 10% of MA, carry their size in SP usable aboard, combine and divide within the five-point counter mix, and never re-load SP unloaded the same phase; five points form an Extender (half MA, must connect, range 20 Truck MP) that is a supply source and collapses when entered; dumps can be blown once per phase; captured dumps and trucks follow the Capture Table and the owner places displaced trucks. Generated games have no Organic Trucks or wagons.'),
  entry('combat.ground', 'IMPLEMENTED', ['9.1-9.14'], 'rules/combat', ['DECLARE_COMBAT', 'RESPOND_DECISION', 'CANCEL_TRANSACTION'], ['COMBAT'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Whole-hex defence, multi-hex attacks, attacker 1T/step and defender 2T/1T combat supply paid from dumps the owner picks (internal stocks when on-map SP is short), class and AT terrain modifiers, the defender\'s announced terrain for his stack and line, OCS odds rounding, AR DRM, Surprise, the v4.3 Combat Table, losses/options/exploits, retreats to destinations the owner picks (together, split, or with non-attacking tagalongs), DG and enemy-ZOC effects, advance by any subset, and dump/truck capture. Each attacking stack gets the terrain that weakens it most (9.4b): that pick only lowers the attack, so it is always the defender\'s best and is not asked.'),
  entry('overrun.ground', 'IMPLEMENTED', ['8.0', '8.1', '12.5b'], 'rules/combat', ['DECLARE_COMBAT'], ['COMBAT'], [CONFORMANCE, LOGISTICS],
    '3 MP per overrun, at least 3 MP left, entry cost 3 MP or less without roads, no DG attackers, Combat/Move/Exploit modes, units that started the phase together, fuel required, mandatory entry after success, no exploit results.'),
  entry('barrage.artillery', 'PARTIAL', ['10.0', '10.1', '13.4'], 'rules/combat', ['DECLARE_BARRAGE', 'RESPOND_DECISION', 'CANCEL_TRANSACTION'], ['BARRAGE'], [CONFORMANCE, LOGISTICS],
    'v4.3 Barrage Table with cost from the initial column paid through one HQ or one dump of the player\'s choice (never internal stocks), density with a 3 RE cap per formation, terrain (the largest left shift, always the target\'s best pick), spotter and Strat shifts, [1/2] and 1/2 results, one barrage per Hex and per unit each phase, Reserve/Strat exclusion, and phase limits. GAP: hedgehog shifts are unused and artillery never fires on the Barrage vs Facility Table, because hedgehogs and ports (16.0, 19.0) are deferred; Air Bases are barraged on that table by aircraft only (air.missions).'),
  entry('lifecycle.ground', 'PARTIAL', ['2.3', '5.10', '13.6'], 'rules/lifecycle', ['PLACE_REINFORCEMENT', 'ADVANCE_SEQUENCE'], ['VICTORY'], [CONFORMANCE, LOGISTICS, 'rule-engine-integration.test.ts'],
    'Reinforcements and Supply Table SP must be placed on arrival (at the nearest open map-edge Hex when an entry is blocked) and may overstack; units that broke out return on their turn; Clean Up; control; turn limit and objective scoring. GAP: the Variable Reinforcement Table is not implemented; Pax, Eq and ground rebuilds are replacements-rebuilds, arriving aircraft air.replacements-and-reinforcements.'),
  entry('breakdowns', 'IMPLEMENTED', ['20.0'], 'rules/breakdown', ['CREATE_BREAKDOWN', 'RESPOND_DECISION', 'ADVANCE_SEQUENCE'], ['MOVEMENT_CANDIDATES'], ['breakdowns.test.ts'],
    'Multi-step "Other" units with a Breakdown pool detach 1 RE, one-step Breakdowns as they begin to move (no MP spent yet, not already finished; no MP cost, 20.0e) and, through the retreat and advance decisions, as they begin to retreat or advance after combat (20.0a; the Breakdown joins the retreat, which may then split, or may advance on its own); the parent loses a step and its last step never detaches; the Breakdown copies the parent\'s mode and markers (20.0c) and may move that phase; its printed AR may not exceed the parent\'s (20.0b). At the end of every phase, reduced units absorb eligible stacked Breakdowns of their pool (AR at least their own, same mode and markers, 20.0d); when several could and none is the Breakdown\'s own division, its owner chooses (BREAKDOWN_ABSORPTION decision); the projection lists the viewer\'s pending absorptions so the UI can warn before the phase ends. House extension beyond the board game (user request): each Breakdown is linked to the division that detached it and numbered after it ("1/101.Abn", the lowest number not in play), with no counter-mix limit, and its own division takes it back first.'),
  deferred('hedgehogs-engineering', ['13.8a-c', '16.0'], 'rules/combat', 'Engineers cannot bridge or build hedgehogs; HQ detrainable hexes (13.8c) are supply.rail-trace and Air Base construction (13.8d) is air.bases-and-refit.'),
  deferred('movement.rail-sea-air', ['13.3a', '13.3b', '13.3e', '13.6b', '19.0'], 'rules/movement', 'TODO rail-cap: Rail Cap transport of units, Transport Points and SP (entrain/move/detrain in the Movement Phase, multi-track halving, Trainbusting doubling, reinforcements entraining off-map) and sea transport are not implemented; generated maps already carry the rail net and detrainable hexes they need (supply.rail-trace). Air Transport is air.transport-and-drop.'),
  entry('replacements-rebuilds', 'PARTIAL', ['13.5', '13.5a', '13.5b', '13.5c', '13.5e'], 'rules/replacement', ['REBUILD_UNITS', 'PLACE_REINFORCEMENT', 'ADVANCE_SEQUENCE'], ['REPLACEMENTS'], [REPLACEMENTS, AIR_SUPPORT],
    'Every generated game gives both sides Pax and Eq each Reinforcement Phase; they are placed at an entry hex or within 2 hexes of a friendly HQ and merge per kind and hex. Repls in one hex at or within 2 hexes of an HQ in Combat Mode (or DG oriented to Combat), not in an un-negated enemy ZOC, rebuild any number of steps: Dead Pile units return in that hex in a voluntary mode their counter can show, without stale supply/mode markers; reduced units must be stacked with the Repls and keep their mode. The Rebuild Table is derived from each counter: Armor, Mech and artillery steps cost 1 Eq, all other steps 1 Pax; no-rebuild-dot units, Breakdowns and Transport Points never return as units (13.5b-c). Trucks the enemy captures or that are displaced with nowhere to go are recorded per owner, and 1 Eq rebuilds one of those points as a truck in the Eq hex (13.5e). GAP: the allotment is a fixed generator table (Compact 1 Pax/1 Eq, Standard 2/1, Large 3/2), not a rolled Variable Replacement Table; the Rebuild Table is one generic rule rather than a game\'s printed table, so 13.5d pair rebuilds never apply; Repl counters are not combat units (no 1/4 RE stacking, ZOC, Attack-Capable step losses, supply or fuel, and they cannot move after placement, so a reduced unit must come to them); Unit Consolidation (13.9) is not implemented.'),
  entry('air.bases-and-refit', 'PARTIAL', ['3.5', '9.14f', '13.8d', '13.9', '14.1', '14.2a', '15.0', '15.1', '15.2', '15.3', '15.4'], 'rules/air', ['REFIT_AIRCRAFT', 'REDUCE_AIR_BASE', 'COMBINE_AIRCRAFT', 'BUILD_AIR_BASE', 'MOVE_PIECE', 'DECLARE_AIR_MISSION'], ['AIR'], [AIR, 'air-integration.test.ts', AIR_TRANSPORT],
    'Two-step aircraft, Active/Inactive, 4 + Level Active aircraft per Air Base, refit once per phase of 2 x Level aircraft (1 at an Air Strip) for 1T drawn or thrown to the base (not in an un-negated enemy ZOC), voluntary reduction by one RE in Combat Mode (also by an Engineer-Capable unit), combining reduced aircraft, and capture on the Air Base Capture Table with displacement to a base within twice the range, by a ground move, an advance or an Air Drop landing (the rolls are reported). Engineer-Capable units (an HQ or Engineer in Combat Mode) build within 2 Leg MP, once per phase and then do not move: an Air Strip for 1T, a Strip upgraded to Level 1 for 3T, a new Level 1 base for 4T, and +1 Level for 4T once per turn up to Level 3, paid from dumps that reach the hex. GAP: generated games allow Air Strips (a per-game choice, fixed here to allowed); construction supply comes only from dumps whose draw reaches the hex (an interpretation of 15.0d); the BTR rule that halves refit in Mud and Snow is not applied (game-specific rules were left out at the user\'s request).'),
  entry('air.missions', 'PARTIAL', ['10.0c', '10.0d', '10.0e', '10.2', '14.1e', '14.2', '14.3', '14.4', '14.5', '14.6', '14.7', '14.8', '14.11'], 'rules/air', ['DECLARE_AIR_MISSION', 'RESPOND_DECISION'], ['AIR'], [AIR, 'air-integration.test.ts'],
    'Air Mission Sequence with up to four aircraft from any bases: Air Combat in an enemy base hex (parenthesized ratings, voluntary aborts, alternating picks, loss die), Interception by one Active Fighter whose Patrol Zone covers the mission hex, Flak with the 14.4e modifiers and the Mission Loss Table, air barrages on units (no supply cost, short-range shift, Strategic Bombers unspotted, [1/2] as DG), Barrage vs Facility on Air Bases, Trainbusting zones (+1 MP to enemy ground movement, Leg only in the marker hex, removed at the enemy Clean Up), Fighter Sweeps, and Base Transfers. GAP: no air force is listed as able to Hip Shoot because the game-specific rules were left out, so Hip Shoots are never available in generated games; flight weather (game Weather Table) never restricts missions; Trainbusting has no rail effect because Rail Cap transport is deferred (movement.rail-sea-air); there is no ship Flak.'),
  entry('air.transport-and-drop', 'PARTIAL', ['4.7b', '14.9', '14.10'], 'rules/air', ['DECLARE_AIR_MISSION', 'PLAN_AIR_DROP', 'UPDATE_AIR_DROP_PLAN', 'RESPOND_DECISION'], ['AIR'], [AIR_TRANSPORT],
    'Transports (C-47, C-47 with integral glider, Ju.52) carry supply from dumps in their base hex and Leg units in Move Mode with MA 10 or less and at most half spent (1T per RE, half for Leg MA 6 or less), flying Double, Normal (or Normal and stay), and Half range for double capacity (or Half and stay); unloading at a base is limited to 2T x Level per Movement Segment (2T at a Strip) except for planes that stay Inactive there or tow their own glider; carried units have half their MA for the phase; Flak in an enemy Patrol Zone cuts capacity and the owner chooses the cargo lost, rounding for survival. Drop Plans are made in the Aircraft Refit Phase two turns ahead (any turn in the first Refit Phase of the game), one per unit, delayed or cancelled there, and lapse; planned Para units drop by parachute, any eligible Leg unit by integral-glider Transports, supply without a plan; each unit and 1T rolls on the Air Transport Success Table (friendly/enemy, clear/closed, +1 for gliders), landing on enemy combat units destroys the cargo, and dropped units need no trace supply that turn (12.6h). GAP: separate Glider Points (14.10f) are not provided by generated games, so only integral-glider Transports land gliders; the -1 Success Table modifiers for the ETO before 8/44 and for Soviet drops are game-specific and not applied; the paratroop battalions of generated games are generator-defined counters (TODO para-gpid), and the Transport silhouettes are drawn by eye (TODO transport-art).'),
  entry('air.replacements-and-reinforcements', 'PARTIAL', ['13.5f', '13.6'], 'rules/air', ['REBUILD_AIRCRAFT', 'PLACE_REINFORCEMENT', 'ADVANCE_SEQUENCE'], ['AIR'], [AIR_SUPPORT],
    'Equipment (Eq) replacement counters arrive each Reinforcement Phase and are placed at an entry hex or within 2 hexes of a friendly HQ; an Eq beside an HQ in Combat Mode, not in an un-negated enemy ZOC, rebuilds two aircraft steps (a Dead Pile aircraft arrives Active at a chosen friendly Air Base, a reduced aircraft stacked with the Eq becomes whole), never partly used; reinforcing aircraft arrive on their turn at a friendly Air Base with Active room. GAP: Eq (and Pax) are a fixed generator allotment per turn, built into every game (see replacements-rebuilds), not a rolled Variable Replacement Table; Eq counters are not combat units (no ZOC, stacking, losses or supply).'),
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
    sourceDocument: 'Beyond the Rhine VASSAL module 1.27.0, images/BTR Axis Supply.jpg', locator: 'German Supply Table (column = divisions per side in generated games)',
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
    id: 'table:ocs-4.3-air', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}1 1000.png`, locator: 'Air Combat (14.3e), Flak (14.4e), Mission Loss (14.4f), Air Base Capture (9.14f), Air Transport Success (14.10d)',
    sourceSha256: 'c12961fdf2eb4c9eb5bf750d81300cd727abe2dc04deccebe59eb89a31c35822',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:ocs-4.3-barrage-vs-facility', rulesVersion: 'OCS 4.3',
    sourceDocument: `${V43_CHARTS}4 1000.png`, locator: 'Barrage vs Facility Table (10.0c)',
    sourceSha256: '69b711ebb28640f9c2262677c8a7595b75765e7b130ec7dfc1b61818abbd94c9',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
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
