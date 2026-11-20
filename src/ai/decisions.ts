import type { HexId, PieceId } from '../core/index.js';
import type { GameAction } from '../rules/index.js';
import { COMBAT_TABLE_COLUMNS, parseCombatResult, type CombatLine } from '../rules/tables/ocs-4.3.js';
import type { OwnUnit, Situation } from './analysis.js';
import type { BotDecision, BotDecisionContext } from './model.js';
import { hexesBetween } from './knowledge.js';

/**
 * Answers to pending decisions that favour the deciding side. Each answer names the responder that chose it,
 * so a trace shows which rule picked the option.
 */

type Option = { readonly id: string; readonly label: string; readonly hexId: string | null };

const respond = (actions: readonly GameAction[], choiceId: string, responder: string, why: string, score = 0): BotDecision | null => {
  const action = actions.find((candidate) => candidate.kind === 'RESPOND_DECISION' && candidate.choiceId === choiceId);
  return action ? {
    action, intent: `${responder}: ${why}`, score, breakdown: [{ term: responder, value: score }],
    alternatives: actions.filter((other) => other !== action).slice(0, 2),
  } : null;
};

/** Value of keeping a unit for a single step loss: strength per step, with HQs and artillery protected. */
const unitValue = (unit: OwnUnit | undefined): number => {
  if (!unit) return 1;
  const base = Math.max(1, unit.profile?.strength ?? 1) / Math.max(1, unit.profile?.steps ?? 1);
  return unit.piece.role === 'HQ' ? base + 20 : unit.piece.role === 'ARTILLERY' ? base + 8 : base;
};

/** Value of keeping a whole unit against total elimination (OVERSTACK_ELIMINATION, 4.8a): total strength × steps. */
const wholeUnitValue = (unit: OwnUnit | undefined): number => {
  if (!unit) return 1;
  const base = Math.max(1, unit.profile?.strength ?? 1) * Math.max(1, unit.profile?.steps ?? 1);
  return unit.piece.role === 'HQ' ? base + 100 : unit.piece.role === 'ARTILLERY' ? base + 40 : base;
};

const pieceIdOf = (optionId: string): PieceId => optionId.slice(optionId.indexOf(':') + 1) as PieceId;

/** The cheapest unit to lose a step or to eliminate. */
const cheapest = (options: readonly Option[], situation: Situation, scorer: (unit: OwnUnit | undefined) => number = unitValue): Option | undefined => {
  const byId = new Map(situation.own.map((unit) => [String(unit.piece.id), unit]));
  return [...options].sort((left, right) =>
    scorer(byId.get(String(pieceIdOf(left.id)))) - scorer(byId.get(String(pieceIdOf(right.id)))) || left.id.localeCompare(right.id))[0];
};

/** The safest hex: least enemy threat, then nearest friendly units. */
const safestHex = (options: readonly Option[], situation: Situation): Option | undefined => {
  const scored = options.filter(({ hexId }) => hexId !== null).map((option) => {
    const hexId = option.hexId as HexId;
    const objective = situation.objectives.some((objective) => objective.hexId === hexId) ? -2 : 0;
    return { option, score: situation.threatAt(hexId) - situation.friendlyAt(hexId).length * 2 + objective };
  });
  return scored.sort((left, right) => left.score - right.score || left.option.id.localeCompare(right.option.id))[0]?.option;
};

const TERRAIN_LINES: Readonly<Record<string, CombatLine>> = {
  open: 'OPEN',
  close: 'CLOSE',
  'very close': 'VERY_CLOSE',
  'extremely close': 'EXTREMELY_CLOSE',
};

const ratio = (label: string): number => {
  const match = /(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\s*$/u.exec(label);
  return match ? Number(match[1]) / Number(match[2]) : Number.POSITIVE_INFINITY;
};

/** 9.7a Combat Table column index for a DEFENDER_TERRAIN option label (lower favors the defender). */
const terrainColumn = (label: string): number => {
  const lineMatch = /:\s*(open|close|very close|extremely close)\s+line\b/iu.exec(label);
  const oddsMatch = /(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\s*$/u.exec(label);
  if (!lineMatch || !oddsMatch) return Number.POSITIVE_INFINITY;
  const line = TERRAIN_LINES[lineMatch[1]!.toLowerCase()]!;
  const attacker = Number(oddsMatch[1]);
  const defender = Number(oddsMatch[2]);
  const columns = COMBAT_TABLE_COLUMNS[line];
  if (defender === 0) return columns.length;
  const value = attacker / defender;
  let index = 0;
  for (let position = 0; position < columns.length; position += 1) {
    const column = columns[position]!;
    if (column.attacker / column.defender <= value + 1e-9) index = position;
  }
  return index;
};

export const respondToDecision = (context: BotDecisionContext, situation: Situation, holdRatio = 0.5, advanceThreatLimit = 8, optionAdvance = 0, advanceUnfunded = 0, meetingOptionAdvance = 0): BotDecision | null => {
  const decision = context.view.pendingDecision!;
  const options = decision.options as readonly Option[];
  const actions = context.actions.candidates('RESPOND_DECISION');
  const projection = context.view.projection!;
  const defending = projection.combat !== null && projection.combat.attackerOwnerId !== context.playerId;
  const targetHex = projection.combat?.targetHexId as HexId | undefined;
  const has = (id: string) => options.some((option) => option.id === id);
  const first = () => respond(actions, options[0]!.id, 'first-option', 'no preference among the options');

  switch (decision.kind) {
    case 'FIRST_PLAYER': {
      const ownVp = situation.objectives.filter(o => o.controllerId === context.playerId).reduce((total, o) => total + o.points, 0);
      const otherVp = situation.objectives.filter(o => o.controllerId !== null && o.controllerId !== context.playerId).reduce((total, o) => total + o.points, 0);
      // On the last turn the side that moves second has the last word on who holds each objective.
      // Meeting VP starts balanced: when behind, answer the enemy's move now rather than
      // waiting until turn 7. Attack scenarios intentionally start with unequal VP totals.
      if ((situation.turnsLeft <= 0 || (ownVp < otherVp && (situation.turnsLeft === 1 || !situation.attack))) && has('second')) return respond(actions, 'second', 'first-player', 'VP deficit: move second to answer the opponent on the objectives');
      return respond(actions, has('first') ? 'first' : options[0]!.id, 'first-player', 'moving first keeps the initiative');
    }
    case 'SUPPLY_SOURCE': {
      if (projection.combat?.kind === 'BARRAGE') {
        const explained = actions[0] ? context.actions.explain(actions[0]).explanation : null;
        const choice = explained?.facts.find(({ key }) => key === 'supply.barrageRationSafeChoice')?.value;
        if (typeof choice === 'string') {
          const safe = respond(actions, choice, 'facility-supply', 'pay the facility barrage while preserving shared rations');
          return safe ? { ...safe, alternatives: [] } : null;
        }
      }
      // Pay from the dump that has the most left, the full amount where possible; internal stocks before going unsupplied.
      const pays = options.filter(({ id }) => id.startsWith('pay:')).map((option) => ({
        option,
        tokens: Number(option.id.slice(option.id.lastIndexOf(':') + 1)),
        available: Number(/\((\d+)T available\)/u.exec(option.label)?.[1] ?? 0),
      })).sort((left, right) => right.tokens - left.tokens || right.available - left.available || left.option.id.localeCompare(right.option.id));
      if (pays[0]) return respond(actions, pays[0].option.id, 'supply-source', `pay ${pays[0].tokens}T from the fullest dump in reach`);
      if (has('internal')) return respond(actions, 'internal', 'supply-source', 'no dump in reach: use internal stocks');
      return first();
    }
    case 'DEFENDER_LEAD': {
      // The lead defender with the lowest combat DRM for the attacker.
      // Labels print signs with U+2212 (−) as well as + and -.
      const drm = (label: string): number => {
        const match = /DRM ([+\-−]?)(\d+)/u.exec(label);
        return match ? (match[1] === '-' || match[1] === '−' ? -1 : 1) * Number(match[2]) : 0;
      };
      const best = [...options].sort((left, right) => drm(left.label) - drm(right.label) || left.id.localeCompare(right.id))[0]!;
      return respond(actions, best.id, 'defender-lead', `lead with the unit giving the attacker the lowest DRM (${best.label})`);
    }
    case 'DEFENDER_TERRAIN': {
      const best = [...options].sort((left, right) =>
        terrainColumn(left.label) - terrainColumn(right.label)
        || ratio(left.label) - ratio(right.label)
        || left.id.localeCompare(right.id))[0]!;
      return respond(actions, best.id, 'defender-terrain', `terrain giving the lowest odds (${best.label})`);
    }
    case 'STEP_LOSS':
    case 'ATTRITION_LOSS': {
      const choice = cheapest(options, situation, unitValue) ?? options[0]!;
      return respond(actions, choice.id, 'cheapest-loss', `lose the least valuable unit (${choice.label})`);
    }
    case 'OVERSTACK_ELIMINATION': {
      const choice = cheapest(options, situation, wholeUnitValue) ?? options[0]!;
      return respond(actions, choice.id, 'cheapest-loss', `eliminate the least valuable whole unit (${choice.label})`);
    }
    case 'OPTION_SPLIT': {
      if (has('option:ignore')) return respond(actions, 'option:ignore', 'combat-option', 'the option may be ignored');
      const parsed = options.map((option) => {
        const [, losses = '0', retreat = '0'] = option.id.split(':');
        return { option, losses: Number(losses), retreat: Number(retreat), trapped: /eliminated/u.test(option.label) };
      }).filter(({ trapped }) => !trapped);
      // optionAdvance (bot-option-retreat-advance): the attacker of an attack engagement, attacking an objective it does
      // not hold, takes the option as step losses when the result may empty the hex (the defender's losses and option at
      // least its number of units, each of which has a step) and an attacker keeps a step: a retreating attacker forfeits
      // the advance (9.11), and the S5.4a census found such cleared objectives walked back into.
      const result = projection.combat?.result ? parseCombatResult(projection.combat.result) : null;
      // meetingOptionAdvance: the same for either side of a meeting engagement (S8.3 of the improvement WBS).
      const optionScope = situation.attack ? optionAdvance > 0 && !situation.defending : meetingOptionAdvance > 0;
      const stepsLeftOf = (option: Option): number | undefined => {
        const action = actions.find((candidate) => candidate.kind === 'RESPOND_DECISION' && candidate.choiceId === option.id);
        const left = action ? context.actions.explain(action).explanation.facts.find(({ key }) => key === 'combat.optionStepsLeft')?.value : undefined;
        return typeof left === 'number' ? left : undefined;
      };
      if (optionScope && !defending && targetHex !== undefined && result !== null
        && situation.objectives.some(({ hexId, controllerId }) => hexId === targetHex && controllerId !== context.playerId)
        && result.defender.loss + result.defender.option >= Math.max(1, projection.combat?.defenderCount ?? 1)) {
        const stay = parsed.find(({ option, retreat }) => retreat === 0 && (stepsLeftOf(option) ?? 0) > 0);
        if (stay) return respond(actions, stay.option.id, 'combat-option', `keep the advance onto the objective: ${stay.option.label}`);
      }
      // heuristic@75: an attacker option retreats every attacker (9.11). Attackers may stand on an objective we hold
      // next to the target; retreating them hands it to the next enemy unit that passes (a recorded final turn lost a
      // 4 VP point this way). The projection does not name the attackers, so any held objective beside the target that
      // has our combat units on it counts.
      const holdsBeside = !defending && targetHex !== undefined && situation.opponentTurnRemains
        && situation.objectives.some(({ hexId, controllerId }) => controllerId === context.playerId && hexesBetween(hexId, targetHex) === 1
          && situation.friendlyAt(hexId).some((unit) => situation.isCombatUnit(unit)));
      const holdObjective = holdsBeside || (defending && targetHex !== undefined
        && situation.objectives.some(({ hexId }) => hexId === targetHex));
      // Hold an objective with steps only when a step actually survives to remain in the hex; losing the last step
      // vacates the objective anyway, so prefer retreating to keep the unit alive.
      const canHold = holdObjective && parsed.some(({ option, retreat }) => retreat === 0 && (stepsLeftOf(option) ?? 1) > 0);
      const ordered = [...parsed].sort((left, right) => canHold
        ? left.retreat - right.retreat || left.losses - right.losses
        : left.losses - right.losses || left.retreat - right.retreat);
      const choice = ordered[0]?.option ?? options[0]!;
      return respond(actions, choice.id, 'combat-option', canHold ? `hold the objective: ${choice.label}` : `keep steps: ${choice.label}`);
    }
    case 'RETREAT_HEX': {
      const hexOptions = options.filter(({ id }) => id.startsWith('hex:') || id.startsWith('with:'));
      const rated = hexOptions.flatMap(option => {
        const action = actions.find(candidate => candidate.kind === 'RESPOND_DECISION' && candidate.choiceId === option.id);
        if (!action) return [];
        const { explanation } = context.actions.explain(action);
        const value = (key: string) => explanation.facts.find(fact => fact.key === key)?.value;
        const losses = value('supply.retreatForcedLosses');
        const unfed = value('supply.retreatUnfed');
        const trace = value('supply.retreatTraceLost');
        return explanation.allowed && typeof losses === 'number' && typeof unfed === 'number' && typeof trace === 'number'
          ? [{ option, losses, unfed, trace }] : [];
      }).sort((a, b) => a.losses - b.losses || a.unfed - b.unfed || a.trace - b.trace);
      const best = rated[0];
      const tied = best ? rated.filter(r => r.losses === best.losses && r.unfed === best.unfed && r.trace === best.trace).map(r => r.option) : hexOptions;
      const choice = safestHex(tied, situation) ?? options[0]!;
      const result = respond(actions, choice.id, 'retreat-supply', `minimize forced losses and supply risk, then enemy threat (${choice.label})`);
      // A dispatch rejection must not fall back to a retreat with unchecked supply risk.
      return result ? { ...result, alternatives: [] } : null;
    }
    case 'DISPLACEMENT_HEX': {
      const hexOptions = options.filter(({ id }) => id.startsWith('hex:') || id.startsWith('with:'));
      const choice = safestHex(hexOptions.length > 0 ? hexOptions : options, situation) ?? options[0]!;
      return respond(actions, choice.id, 'safest-hex', `go where the enemy threat is lowest (${choice.label})`);
    }
    case 'ADVANCE_HEX': {
      const objective = targetHex !== undefined && situation.objectives.some(({ hexId, controllerId }) => hexId === targetHex && controllerId !== context.playerId);
      const threat = targetHex === undefined ? 0 : situation.threatAt(targetHex);
      // One attacker at a time, never the only garrison of an objective we hold (heuristic@11: replays showed held
      // objectives left empty by advancing their garrison, then walked into). Into an enemy objective, a garrison
      // advances only when no other attacker can.
      const byId = new Map(situation.own.map((unit) => [String(unit.piece.id), unit]));
      const holdsObjective = (unit: OwnUnit | undefined) => unit !== undefined
        && situation.objectives.some(({ hexId, controllerId }) => hexId === unit.hexId && controllerId === context.playerId)
        && situation.friendlyAt(unit.hexId).filter((other) => situation.isCombatUnit(other)).length <= 1;
      const presentRe = targetHex === undefined ? 0
        : situation.friendlyAt(targetHex).reduce((total, u) => total + (u.profile?.re ?? 0), 0);
      const advancers = options.filter(({ id }) => id.startsWith('advance:') && id !== 'advance:done' && id !== 'advance:all')
        .map((option) => ({ option, unit: byId.get(option.id.slice('advance:'.length)) }))
        .filter(({ unit }) => unit === undefined || (unit.hexId !== targetHex && presentRe + (unit.profile?.re ?? 0) <= 10 + 1e-9));
      const free = advancers.filter(({ unit }) => !holdsObjective(unit));
      const heldPoint = targetHex === undefined ? undefined : situation.objectives.find(o => o.hexId === targetHex && o.controllerId === context.playerId);
      const heldStrength = targetHex === undefined ? 0 : situation.friendlyAt(targetHex).filter(u => situation.isCombatUnit(u))
        .reduce((total, u) => total + (u.profile?.strength ?? 0), 0);
      if (heldPoint && heldStrength > 0 && heldStrength < threat * holdRatio
        && (situation.turnsLeft > 0 || projection.sequence.playerTurnIndex === 0)) {
        const reinforcements = free.filter(({ unit }) => unit && situation.isCombatUnit(unit)
          && !situation.objectives.some(o => o.hexId === unit.hexId && o.controllerId === context.playerId))
          .sort((a, b) => (b.unit?.profile?.strength ?? 0) - (a.unit?.profile?.strength ?? 0) || a.option.id.localeCompare(b.option.id));
        for (const candidate of reinforcements) {
          const action = actions.find(a => a.kind === 'RESPOND_DECISION' && a.choiceId === candidate.option.id);
          if (!action) continue;
          const { explanation } = context.actions.explain(action);
          const value = (key: string) => explanation.facts.find(f => f.key === key)?.value;
          if (explanation.allowed && value('supply.advanceTraceLost') === 0 && value('supply.advanceFeedLost') === 0
            && (situation.turnsLeft <= 0 || value('supply.advanceMoverHasTrace') === true || value('supply.advanceFunded') === true)) {
            return respond(actions, candidate.option.id, 'reinforce-vp', 'keep the captured objective supplied and strong enough to hold', heldPoint.points);
          }
        }
      }
      const supplied = free.filter(({ option }) => {
        const action = actions.find(a => a.kind === 'RESPOND_DECISION' && a.choiceId === option.id);
        if (!action) return false;
        const explanation = context.actions.explain(action).explanation;
        const value = (key: string) => explanation.facts.find(f => f.key === key)?.value;
        // Regular combat follows this turn's Supply; on the final turn no friendly ration remains.
        // advanceUnfunded: the attacker of an attack engagement enters an objective it has just emptied without the next
        // ration in hand; its Movement Phase comes before its next Supply Phase (S8.1 of the improvement WBS).
        const unfunded = advanceUnfunded > 0 && objective && situation.attack && !situation.defending;
        return explanation.allowed && (situation.turnsLeft <= 0 || unfunded || value('supply.advanceFunded') === true) && value('supply.advanceFeedLost') === 0
          && (value('supply.advanceTraceLost') === 0 || value('supply.advanceMoverHasTrace') === false && value('supply.advanceTraceLost') === 1);
      });
      // The first defender of a newly captured VP must survive the opponent's answer.
      // Prefer strength here rather than the arbitrary order of attacker IDs.
      if (objective) supplied.sort((a, b) => (b.unit?.profile?.strength ?? 0) - (a.unit?.profile?.strength ?? 0)
        || a.option.id.localeCompare(b.option.id));
      const advance = supplied[0]?.option;
      if (advance && (objective || threat < advanceThreatLimit)) {
        return respond(actions, advance.id, 'advance', objective ? 'take the objective' : 'take the ground the defender left');
      }
      return respond(actions, has('advance:done') ? 'advance:done' : options[0]!.id, 'advance', 'no supplied advance worth the exposure');
    }
    case 'BREAKDOWN_ABSORPTION': {
      // The regained step goes to the unit worth most per step (20.0d).
      const byId = new Map(situation.own.map((unit) => [String(unit.piece.id), unit]));
      const best = [...options].sort((left, right) =>
        unitValue(byId.get(right.id.slice(right.id.lastIndexOf('|') + 1))) - unitValue(byId.get(left.id.slice(left.id.lastIndexOf('|') + 1)))
        || left.id.localeCompare(right.id))[0]!;
      return respond(actions, best.id, 'breakdown-absorption', `the step returns to the most valuable unit (${best.label})`);
    }
    default:
      // Air decisions (bot-air TODO) and anything new: the first legal option, marked so traces show the fallback.
      return first();
  }
};
