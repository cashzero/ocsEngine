import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEURISTIC_WEIGHTS, analyze, createBotRng, createHeuristicPolicy, parseGameStateJson, ruleEngine,
  type BotActionAccess, type BotDecisionContext, type GameState, type HexId, type OcsMode, type PieceId,
} from '../../src/index.js';
import { hexesBetween } from '../../src/ai/knowledge.js';
import { allocateTheater, captureProbability } from '../../src/ai/policies/theater.js';

const access = (state: GameState): BotActionAccess => {
  const actorId = state.sequence.actingPlayerId;
  return {
    families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
    movementRange: pieceId => ruleEngine.queryMovementRange(state, actorId, pieceId).value!,
    candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
    explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
    traceCoverage: (pieceId = null) => ruleEngine.queryTraceCoverage(state, actorId, pieceId).value!,
    feedCoverage: (pieceId = null) => ruleEngine.queryFeedCoverage(state, actorId, pieceId).value!,
    drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
    projectedReach: (pieceId, fromHexId, mode) => ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId, mode).value!,
    hqThrow: (hqId, fromHexId) => ruleEngine.queryHqThrow(state, actorId, hqId, fromHexId).value!,
  };
};

// Game Turn 1, the Axis Movement segment of a Western Europe Axis-attack game (P7 match 1500003).
const opening = (): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'theater-allocation-1500003.state.json.gz'))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value;
};

describe('theater allocation (plan P11.8 candidate)', () => {
  it('matches the frozen capture model of plan P11.3', () => {
    // Reference values from scripts/ai-theater-capture-model.py predict() on the frozen model.
    expect(captureProbability({ column: 6, drm: 3, defenderCanPay: true, hedgehogLevel: 0, line: 'CLOSE' })).toBeCloseTo(0.3896033787972916, 12);
    expect(captureProbability({ column: 2, drm: 0, defenderCanPay: true, hedgehogLevel: 1, line: 'OPEN' })).toBeCloseTo(0.0027215327209392957, 12);
    expect(captureProbability({ column: 10, drm: 4, defenderCanPay: false, hedgehogLevel: 0, line: 'EXTREMELY_CLOSE' })).toBeCloseTo(0.9959509635964245, 12);
  });

  it.each([
    ['as found', false],
    // Without dumps to eat from, the groups beyond trace need an HQ placed for them.
    ['without the attacker\'s dumps', true],
  ])('sends units that can be at or beside the objective, supplied, by the step its group attacks, the same way each time (%s)', (_, withoutDumps) => {
    const found = opening();
    const dumpIds = new Set(ruleEngine.projectForViewer(found, found.sequence.actingPlayerId).stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === found.sequence.actingPlayerId && piece.role === 'DUMP').map(({ id }) => id));
    const state: GameState = withoutDumps ? { ...found, pieceState: { ...found.pieceState, pieces: found.pieceState.pieces.filter(({ id }) => !dumpIds.has(id)) } } : found;
    const actorId = state.sequence.actingPlayerId;
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const situation = analyze(ruleEngine.projectForViewer(state, actorId), actorId, facts);
    const reach = (unitId: PieceId, hexId: HexId, mode?: OcsMode) => new Set([String(hexId), ...ruleEngine.queryProjectedReach(state, actorId, unitId, hexId, mode).value!.map((entry) => String(entry.hexId))]);
    const traced = (unitId: PieceId) => new Set(ruleEngine.queryTraceCoverage(state, actorId, unitId).value!.hexIds.map(String));
    const attackHexes = (hexIds: ReadonlySet<string>, objective: HexId, defended: boolean) => (defended
      ? [...hexIds].filter((hexId) => hexesBetween(hexId, objective) === 1 && !situation.enemy.get(hexId as HexId)?.hasCombatUnit)
      : hexIds.has(String(objective)) ? [String(objective)] : []);
    let placements = 0;
    for (const mode of [null, 'COMBAT'] as const) {
      const plan = allocateTheater(situation, access(state), new Set(), () => 2, 0.5, () => mode);
      // Game Turn 1: the far objectives are beyond where any HQ is fed within two steps, so only this-step groups remain.
      expect(plan.groups.some(({ turn }) => turn === 1)).toBe(true);
      // One group per HQ, each HQ fed where it throws from, 3+ hexes from the enemy unless it stays, reached by its move.
      expect(new Set(plan.hqs.map(({ hqId }) => hqId)).size).toBe(plan.hqs.length);
      placements += plan.hqs.length;
      for (const placement of plan.hqs) {
        const hq = situation.own.find(({ piece }) => piece.id === placement.hqId)!;
        expect(ruleEngine.queryHqThrow(state, actorId, placement.hqId, placement.hexId).value!.fed).toBe(true);
        if (placement.moveTo !== hq.hexId) {
          expect(situation.nearestEnemy(placement.moveTo).distance).toBeGreaterThanOrEqual(3);
          expect(reach(placement.hqId, hq.hexId, 'MOVE').has(String(placement.moveTo))).toBe(true);
        }
        if (placement.turn === 1) expect(placement.hexId).toBe(placement.moveTo);
        else expect(reach(placement.hqId, placement.moveTo, 'MOVE').has(String(placement.hexId))).toBe(true);
      }
      for (const group of plan.groups) {
        expect(group.probability).toBeGreaterThan(0);
        expect(group.chance).toBeCloseTo(group.probability * (group.turn === 2 ? 0.5 : 1), 12);
        const placement = plan.hqs.find(({ objective }) => objective === group.hexId);
        const thrown = placement ? ruleEngine.queryHqThrow(state, actorId, placement.hqId, placement.hexId).value! : null;
        const truck = plan.trucks.find(({ objective }) => objective === group.hexId);
        if (truck) expect(group.turn).toBe(2);
        const drawn = truck ? (ruleEngine.queryDrawReach(state, actorId, truck.drop).value ?? []).map(String) : [];
        for (const unitId of group.unitIds) {
          const unit = situation.own.find(({ piece }) => piece.id === unitId)!;
          const now = reach(unitId, unit.hexId, mode ?? undefined);
          const positions = new Set(attackHexes(now, group.hexId, group.defended));
          if (group.turn === 2) {
            const nearest = Math.min(...[...now].filter((hexId) => hexId !== String(group.hexId)).map((hexId) => hexesBetween(hexId, group.hexId)));
            for (const staging of [...now].filter((hexId) => hexesBetween(hexId, group.hexId) === nearest && hexId !== String(group.hexId))) {
              for (const hexId of attackHexes(reach(unitId, staging as HexId, mode ?? undefined), group.hexId, group.defended)) positions.add(hexId);
            }
          }
          // Supplied on the group's step: by the unit's trace now, a dump it can eat from, the HQ placed for the group, or
          // (next step) SP the truck sent for the group unloads.
          const cost = Math.max(1, Math.ceil((unit.profile?.re ?? 1) / 2));
          const eat = ruleEngine.queryFeedCoverage(state, actorId, unitId).value!.filter(({ tokens }) => tokens >= cost).flatMap(({ hexIds }) => hexIds.map(String));
          const supply = new Set([...traced(unitId), ...eat, ...drawn, ...(thrown && thrown.servableIds.includes(unitId) ? thrown.hexIds.map(String) : [])]);
          expect([...positions].some((hexId) => supply.has(hexId))).toBe(true);
        }
      }
      expect(allocateTheater(situation, access(state), new Set(), () => 2, 0.5, () => mode)).toEqual(plan);
      expect(allocateTheater(situation, access(state), new Set(), () => 2, 0, () => mode).groups.every(({ turn }) => turn === 1)).toBe(true);
    }
    if (withoutDumps) expect(placements).toBeGreaterThan(0);
    // Track and truck units have not paid fuel yet at the first Movement decision; the plan still counts them.
    if (!withoutDumps) expect(allocateTheater(situation, access(state), new Set(), () => 2, 0.5, () => null).groups.some(({ unitIds }) => unitIds.some((unitId) => ruleEngine.queryMovementRange(state, actorId, unitId).reasons.some(({ code }) => code === 'FUEL_REQUIRED')))).toBe(true);
  }, 120_000);

  it('steers the attacker only when the weight is on, with a legal first decision', () => {
    const state = opening();
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const decide = (theaterAllocation: number) => {
      const lines: string[] = [];
      const policy = createHeuristicPolicy(facts, { weights: { ...DEFAULT_HEURISTIC_WEIGHTS, theaterAllocation }, debug: (line) => lines.push(line) });
      const context: BotDecisionContext = {
        seatId: 'seat:theater' as BotDecisionContext['seatId'], playerId: state.sequence.actingPlayerId,
        memory: { stepKey: 'theater', actions: 0, notes: new Map() }, rng: createBotRng(7, 'theater', 0),
        view: { projection: ruleEngine.projectForViewer(state, state.sequence.actingPlayerId), pendingDecision: null } as unknown as BotDecisionContext['view'],
        actions: access(state),
      };
      const chosen = policy.decide(context);
      return { chosen, lines };
    };
    const off = decide(0), on = decide(1);
    expect(off.lines.some((line) => line.includes('THEATER'))).toBe(false);
    expect(on.lines.some((line) => line.includes('THEATER'))).toBe(true);
    expect(on.chosen).not.toBeNull();
    expect(ruleEngine.validateAction(state, on.chosen!.action).allowed).toBe(true);
  });
});
