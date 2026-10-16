import { hexDistance, parseHexCoordinateId, type HexId } from '../core/index.js';
import { parseHexsideId } from '../domain/map/index.js';
import type { PieceDefinition } from '../domain/piece/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { ProjectedPiece } from '../rules/index.js';

/** What both players know before the first move: the map, the counters' printed values, objectives and the turn limit. */
export interface BotGameFacts {
  readonly scenario: ScenarioDefinition;
  readonly turnLimit: number;
}

/** A counter's printed values on the face and step it shows (the full-strength step when steps are hidden). */
export interface UnitProfile {
  readonly strength: number;
  readonly actionRating: number;
  /** Movement Allowance in whole MP. */
  readonly movement: number;
  readonly range: number;
  /** Stacking size in RE. */
  readonly re: number;
  readonly steps: number;
}

export interface BotKnowledge {
  readonly definition: (piece: ProjectedPiece) => PieceDefinition | undefined;
  readonly profile: (piece: ProjectedPiece) => UnitProfile | null;
  readonly name: (piece: ProjectedPiece) => string;
  /** Hexes a railroad runs through (13.3), from the printed map. */
  readonly railHexes: ReadonlySet<string>;
  /** Railroad hexes with a village, town or city: stations SP can detrain at once controlled and connected (13.3c). */
  readonly stationHexes: ReadonlySet<string>;
}

const knowledgeCache = new WeakMap<BotGameFacts, BotKnowledge>();

export const knowledgeOf = (facts: BotGameFacts): BotKnowledge => {
  const cached = knowledgeCache.get(facts);
  if (cached) return cached;
  const definitions = new Map(facts.scenario.pieceCatalog.definitions.map((definition) => [String(definition.id), definition]));
  const definition = (piece: ProjectedPiece) => definitions.get(String(piece.definitionId));
  const railHexes: ReadonlySet<string> = new Set(facts.scenario.mapDefinition.hexsides
    .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => String(id) === 'edge:rail' || String(id) === 'edge:multi-track-rail'))
    .flatMap(({ hexsideId }) => { const parsed = parseHexsideId(hexsideId); return parsed.ok ? [String(parsed.value.firstHexId), String(parsed.value.secondHexId)] : []; }));
  const knowledge: BotKnowledge = {
    definition,
    profile: (piece) => {
      const printed = definition(piece);
      const face = printed?.faces.find(({ id }) => id === piece.currentFaceId) ?? printed?.faces[0];
      if (!face || face.steps.length === 0) return null;
      const full = face.steps.reduce((best, step) => step.remainingSteps > best.remainingSteps ? step : best);
      const step = piece.remainingSteps === null ? full : face.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps) ?? full;
      return {
        strength: step.combatStrength ?? 0,
        actionRating: step.actionRating ?? 0,
        movement: Number(step.movementPointTicks ?? 0) / 4,
        range: step.range ?? 0,
        re: Number(step.regimentalEquivalentTicks ?? 0) / 4,
        steps: step.remainingSteps,
      };
    },
    name: (piece) => definition(piece)?.name ?? String(piece.id),
    railHexes,
    stationHexes: new Set(facts.scenario.mapDefinition.hexes.filter(({ id, features }) => railHexes.has(String(id))
      && features.some(({ definitionId }) => /^settlement:(village|town|city)$/u.test(String(definitionId)))).map(({ id }) => String(id))),
  };
  knowledgeCache.set(facts, knowledge);
  return knowledge;
};

export const hexesBetween = (left: HexId | string, right: HexId | string): number => {
  const from = parseHexCoordinateId(left);
  const to = parseHexCoordinateId(right);
  return from.ok && to.ok ? hexDistance(from.value, to.value) : Number.POSITIVE_INFINITY;
};
