import type { HexId, PieceId } from '../core/index.js';
import type { GameAction } from '../rules/index.js';
import type { OwnUnit, Situation } from './analysis.js';
import type { BotDecision, BotDecisionContext } from './model.js';

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

/** Value of keeping a unit: strength per step, with HQs and artillery worth more than their printed strength. */
const unitValue = (unit: OwnUnit | undefined): number => {
  if (!unit) return 1;
  const base = Math.max(1, unit.profile?.strength ?? 1) / Math.max(1, unit.profile?.steps ?? 1);
  return unit.piece.role === 'HQ' ? base + 20 : unit.piece.role === 'ARTILLERY' ? base + 8 : base;
};

const pieceIdOf = (optionId: string): PieceId => optionId.slice(optionId.indexOf(':') + 1) as PieceId;

/** The cheapest unit to lose a step or to eliminate. */
const cheapest = (options: readonly Option[], situation: Situation): Option | undefined => {
  const byId = new Map(situation.own.map((unit) => [String(unit.piece.id), unit]));
  return [...options].sort((left, right) =>
    unitValue(byId.get(String(pieceIdOf(left.id)))) - unitValue(byId.get(String(pieceIdOf(right.id)))) || left.id.localeCompare(right.id))[0];
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

const ratio = (label: string): number => {
  const match = /(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\s*$/u.exec(label);
  return match ? Number(match[1]) / Number(match[2]) : Number.POSITIVE_INFINITY;
};

export const respondToDecision = (context: BotDecisionContext, situation: Situation): BotDecision | null => {
  const decision = context.view.pendingDecision!;
  const options = decision.options as readonly Option[];
  const actions = context.actions.candidates('RESPOND_DECISION');
  const projection = context.view.projection!;
  const defending = projection.combat !== null && projection.combat.attackerOwnerId !== context.playerId;
  const targetHex = projection.combat?.targetHexId as HexId | undefined;
  const has = (id: string) => options.some((option) => option.id === id);
  const first = () => respond(actions, options[0]!.id, 'first-option', 'no preference among the options');

  switch (decision.kind) {
    case 'FIRST_PLAYER':
      // On the last turn the side that moves second has the last word on who holds each objective.
      if (situation.turnsLeft <= 0 && has('second')) return respond(actions, 'second', 'first-player', 'last turn: move second to have the last word on the objectives');
      return respond(actions, has('first') ? 'first' : options[0]!.id, 'first-player', 'moving first keeps the initiative');
    case 'SUPPLY_SOURCE': {
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
      const best = [...options].sort((left, right) => ratio(left.label) - ratio(right.label) || left.id.localeCompare(right.id))[0]!;
      return respond(actions, best.id, 'defender-terrain', `terrain giving the lowest odds (${best.label})`);
    }
    case 'STEP_LOSS':
    case 'ATTRITION_LOSS':
    case 'OVERSTACK_ELIMINATION': {
      const choice = cheapest(options, situation) ?? options[0]!;
      return respond(actions, choice.id, 'cheapest-loss', `lose the least valuable unit (${choice.label})`);
    }
    case 'OPTION_SPLIT': {
      if (has('option:ignore')) return respond(actions, 'option:ignore', 'combat-option', 'the option may be ignored');
      const parsed = options.map((option) => {
        const [, losses = '0', retreat = '0'] = option.id.split(':');
        return { option, losses: Number(losses), retreat: Number(retreat), trapped: /eliminated/u.test(option.label) };
      }).filter(({ trapped }) => !trapped);
      const holdObjective = defending && targetHex !== undefined
        && situation.objectives.some(({ hexId }) => hexId === targetHex);
      // Hold an objective with steps; elsewhere keep steps and give ground.
      const ordered = [...parsed].sort((left, right) => holdObjective
        ? left.retreat - right.retreat || left.losses - right.losses
        : left.losses - right.losses || left.retreat - right.retreat);
      const choice = ordered[0]?.option ?? options[0]!;
      return respond(actions, choice.id, 'combat-option', holdObjective ? `hold the objective: ${choice.label}` : `keep steps: ${choice.label}`);
    }
    case 'RETREAT_HEX':
    case 'DISPLACEMENT_HEX': {
      const hexOptions = options.filter(({ id }) => id.startsWith('hex:') || id.startsWith('with:'));
      const choice = safestHex(hexOptions.length > 0 ? hexOptions : options, situation) ?? options[0]!;
      return respond(actions, choice.id, 'safest-hex', `go where the enemy threat is lowest (${choice.label})`);
    }
    case 'ADVANCE_HEX': {
      const objective = targetHex !== undefined && situation.objectives.some(({ hexId, controllerId }) => hexId === targetHex && controllerId !== context.playerId);
      const threat = targetHex === undefined ? 0 : situation.threatAt(targetHex);
      const advance = options.find(({ id }) => id === 'advance:all') ?? options.find(({ id }) => id.startsWith('advance:') && id !== 'advance:done');
      if (advance && (objective || threat < 8)) {
        return respond(actions, advance.id, 'advance', objective ? 'take the objective' : 'take the ground the defender left');
      }
      return respond(actions, has('advance:done') ? 'advance:done' : options[0]!.id, 'advance', 'the hex is too exposed to enter');
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
