import { err, ok, type Result } from '../core/index.js';

export type RuleSupportStatus = 'IMPLEMENTED' | 'DEFERRED' | 'GAME_SPECIFIC' | 'NOT_APPLICABLE';

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

const implemented = (
  id: string,
  rules: readonly string[],
  owner: string,
  actions: readonly string[],
  queries: readonly string[],
  tests: readonly string[],
  note: string,
): RuleFeatureManifestEntry => ({
  id, rules, status: 'IMPLEMENTED', owner, actions, queries, tests, note,
});

export const RULE_FEATURE_MANIFEST: readonly RuleFeatureManifestEntry[] = Object.freeze([
  implemented('sequence.ground-turn', ['2.1', '2.2', '2.3'], 'rules/sequence', ['ADVANCE_SEQUENCE'], ['SEQUENCE'], ['kernel-sequence-query.test.ts'], 'Headless two-player sequence including all named ground phases.'),
  implemented('mode.transition', ['5.1-5.10'], 'rules/mode', ['CHANGE_MODE', 'RELEASE_RESERVE'], ['MODE_CHANGE'], ['mode-stacking-zoc.test.ts'], 'Voluntary phase restrictions, Reserve release, and involuntary cleanup are enforced.'),
  implemented('stacking.ground', ['4.6', '4.8'], 'rules/stacking', [], ['STACKING'], ['mode-stacking-zoc.test.ts'], '10 RE limit using exact quarter-RE ticks.'),
  implemented('zoc.purpose', ['4.4', '4.5'], 'rules/zoc', [], ['ZOC'], ['mode-stacking-zoc.test.ts'], 'Purpose-specific adjacent enemy ZOC with friendly negation.'),
  implemented('movement.ground', ['6.1-6.3'], 'rules/movement', ['MOVE_PIECE'], ['MOVEMENT_PATH', 'MOVEMENT_CANDIDATES'], ['movement.test.ts', 'movement-tec.test.ts'], 'Mobility-typed TEC costs, road override, most-costly terrain, prohibited and "All" terrain, symmetric legality, phase/mode/ZOC/stacking guards, and minimum move. Fuel (12.5), weather ground conditions, and Reaction/Exploitation eligibility (7.0a/11.0a) remain open.'),
  implemented('transaction.reservation', ['9.2', '10.0', '12.4'], 'rules/transaction', ['RESPOND_DECISION', 'COMMIT_TRANSACTION'], ['TRANSACTION'], ['transaction-supply.test.ts'], 'Serializable reservations and commit-point RNG.'),
  implemented('supply.trace-and-dump', ['12.1', '12.3', '12.4', '12.6'], 'rules/supply', ['CHECK_SUPPLY'], ['SUPPLY'], ['transaction-supply.test.ts'], 'Direct trace and on-map dump draw for the fixed ground slice.'),
  implemented('combat.ground', ['9.1-9.13'], 'rules/combat', ['DECLARE_COMBAT', 'COMMIT_TRANSACTION', 'RESPOND_DECISION'], ['COMBAT'], ['combat.test.ts'], 'Odds, 2d6 table, loss/retreat/advance decisions and Exploit/DG outcomes.'),
  implemented('overrun.ground', ['8.0', '8.1'], 'rules/combat', ['DECLARE_COMBAT'], ['COMBAT'], ['combat.test.ts'], 'Uses combat transaction with overrun phase/adjacency restrictions.'),
  implemented('barrage.artillery', ['10.0', '10.1'], 'rules/combat', ['DECLARE_BARRAGE', 'COMMIT_TRANSACTION'], ['BARRAGE'], ['combat.test.ts'], 'Artillery capability/range, supply reservation, 2d6 result, DG/step loss.'),
  implemented('lifecycle.ground', ['2.3', '5.10', '13.6'], 'rules/lifecycle', ['PLACE_REINFORCEMENT', 'ADVANCE_SEQUENCE'], ['VICTORY'], ['lifecycle.test.ts'], 'Reinforcement placement, cleanup reset, control, turn limit and objective scoring.'),
  { id: 'movement.rail-sea-air', rules: ['13.3', '14.9', '19.0'], status: 'DEFERRED', owner: 'rules/movement', actions: [], queries: [], tests: [], note: 'Transport networks require game-specific capacity data.' },
  { id: 'supply.extender-attrition-breakout', rules: ['12.7', '12.8'], status: 'DEFERRED', owner: 'rules/supply', actions: [], queries: [], tests: [], note: 'MVP reports unsupported instead of approximating these tables.' },
  { id: 'air-power', rules: ['14.0-15.0'], status: 'DEFERRED', owner: 'rules/air', actions: [], queries: [], tests: [], note: 'Outside ground/logistics MVP.' },
  { id: 'naval-shipping', rules: ['18.0-19.0'], status: 'DEFERRED', owner: 'rules/naval', actions: [], queries: [], tests: [], note: 'Outside ground/logistics MVP.' },
  { id: 'optional-rules', rules: ['21.1-21.12'], status: 'DEFERRED', owner: 'rules/optional', actions: [], queries: [], tests: [], note: 'Each optional rule needs an explicit later configuration contract.' },
  { id: 'victory.game-table', rules: ['game-specific'], status: 'GAME_SPECIFIC', owner: 'rules/victory', actions: [], queries: ['VICTORY'], tests: ['lifecycle.test.ts'], note: 'Generic turn/objective adapter is implemented; scenario-specific VP tables are data.' },
]);

export const RULE_TABLE_PROVENANCE: readonly RuleTableProvenance[] = Object.freeze([
  {
    id: 'table:ocs-4.3-ground-combat-mvp', rulesVersion: 'OCS 4.3',
    sourceDocument: 'docs/rules/ocs-series-rules-v4.3.md', locator: '9.7-9.10',
    sourceSha256: '5a0809f449859f1928a568b8695cf6bcb2d0f27934091cc4b8124db43679057f',
    reviewStatus: 'REVIEWED', resolutionPriority: 100,
  },
  {
    id: 'table:ocs-4.3-artillery-barrage-mvp', rulesVersion: 'OCS 4.3',
    sourceDocument: 'docs/rules/ocs-series-rules-v4.3.md', locator: '10.0-10.1',
    sourceSha256: '5a0809f449859f1928a568b8695cf6bcb2d0f27934091cc4b8124db43679057f',
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

export const requireImplementedRuleFeature = (
  featureId: string,
): Result<RuleFeatureManifestEntry, UnsupportedRuleFeatureError> => {
  const feature = RULE_FEATURE_MANIFEST.find(({ id }) => id === featureId);
  return feature?.status === 'IMPLEMENTED'
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
