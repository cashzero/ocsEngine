import type { PieceDefinition } from '../domain/piece/index.js';
import type { ProjectedPiece } from '../rules/index.js';

export type CounterLod = 'full' | 'ratings' | 'symbol';
export const counterLod = (screenPixels: number): CounterLod => screenPixels >= 58 ? 'full' : screenPixels >= 38 ? 'ratings' : 'symbol';
const escape = (value: unknown): string => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
type CounterPiece = Pick<ProjectedPiece, 'currentFaceId' | 'remainingSteps' | 'resourceQuantity' | 'mode' | 'statuses' | 'redacted'>
  & { readonly statusValues?: ProjectedPiece['statusValues']; readonly carriedTokens?: number | null };

const capabilityParameter = (definition: PieceDefinition, capability: string, key: string) =>
  definition.capabilities.find(({ id }) => id === capability)?.parameters.find((parameter) => parameter.key === key);

const nationOf = (definition: PieceDefinition): 'US' | 'GERMAN' =>
  String(definition.ownership.nationalityDefinitionId ?? definition.ownership.sideDefinitionId).includes('axis') ? 'GERMAN' : 'US';

/**
 * 3.5, 14.1: an air unit counter prints its type, model, range, Air Combat Rating (in parentheses
 * when it cannot initiate Air Combat) and Barrage Strength; the back is the reduced side.
 */
const aircraftView = (definition: PieceDefinition, piece: CounterPiece) => {
  const face = definition.faces[0];
  const full = Math.max(0, ...(face?.steps.map(({ remainingSteps }) => remainingSteps) ?? []));
  const step = face?.steps.find(({ remainingSteps }) => remainingSteps === (piece.remainingSteps ?? full));
  const rating = (id: string) => step?.ratings.find(({ ratingDefinitionId }) => ratingDefinitionId === id)?.value ?? 0;
  const type = capabilityParameter(definition, 'AIRCRAFT', 'type');
  const parenthesized = capabilityParameter(definition, 'AIRCRAFT', 'parenthesized');
  const designation = capabilityParameter(definition, 'AIRCRAFT', 'designation');
  return {
    redacted: false as const, kind: 'aircraft' as const, label: definition.name, nation: nationOf(definition),
    type: type?.kind === 'TEXT' ? type.value : '', designation: designation?.kind === 'TEXT' ? designation.value : definition.name,
    airCombat: rating('rating:air-combat'), parenthesized: parenthesized?.kind === 'FLAG' && parenthesized.value,
    barrage: rating('rating:barrage-strength'), range: step?.range ?? 0,
    reduced: (piece.remainingSteps ?? full) < full,
    inactive: piece.statuses.includes('status:air-inactive'),
  };
};

/** 15.0: an Air Base counter shows its Level. */
const airBaseView = (definition: PieceDefinition, piece: CounterPiece) => {
  const level = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
  return { redacted: false as const, kind: 'air-base' as const, label: definition.name, nation: nationOf(definition), level: typeof level === 'number' ? level : 1 };
};

export const counterView = (definition: PieceDefinition, piece: CounterPiece) => {
  if (definition.family === 'AIR') return aircraftView(definition, piece);
  if (definition.facility?.facilityTypeDefinitionId === 'facility:air-base') return airBaseView(definition, piece);
  // A visible enemy counter shows its face; steps lost are hidden (4.9a), so show the printed face.
  if (piece.redacted && piece.currentFaceId === null && definition.counter?.kind !== 'SUPPLY') return { redacted: true as const, label: 'Enemy unit' };
  if (!definition.counter) throw new Error(`Counter definition missing: ${definition.id}`);
  const face = definition.faces.find(({id}) => id === piece.currentFaceId);
  const fullSteps = Math.max(0, ...(face?.steps.map(({ remainingSteps }) => remainingSteps) ?? []));
  const step = face?.steps.find(({remainingSteps}) => remainingSteps === (piece.remainingSteps ?? fullSteps));
  if (definition.counter.kind !== 'SUPPLY' && (!face || !step)) throw new Error(`Counter face/step missing: ${definition.id}`);
  // 13.2c: a divided or combined truck is a smaller or larger counter; its current size is a status, the printed one is the default.
  const points = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:transport-points')?.value;
  return { redacted: false as const, kind: 'unit' as const, label: definition.name, counter: definition.counter, face, step,
    mode: piece.mode, statuses: piece.statuses, quantity: piece.resourceQuantity,
    transportPoints: typeof points === 'number' ? points : definition.counter.transportPoints,
    // The load a friendly truck carries, as Tokens of its capacity (4 per point); null when unknown (enemy) or not a truck.
    load: definition.counter.kind === 'TRANSPORT' && typeof piece.carriedTokens === 'number' && piece.currentFaceId !== 'extender'
      ? { tokens: piece.carriedTokens, capacity: 4 * (typeof points === 'number' ? points : definition.counter.transportPoints ?? 0) } : null,
    barrage: step?.ratings.find(({ratingDefinitionId}) => ratingDefinitionId === 'rating:barrage-strength')?.value ?? null,
    mobility: face?.mobilityClassDefinitionId === 'mobility:tracked' ? 'tracked' : face?.mobilityClassDefinitionId === 'mobility:leg' ? 'leg' : 'truck',
  };
};
export type CounterViewModel = ReturnType<typeof counterView>;
const symbolPaths = {
  INFANTRY: '<path d="M29 25L71 48M71 25L29 48"/>',
  ARMOR: '<ellipse cx="50" cy="36.5" rx="17" ry="8"/>',
  GLIDER: '<path d="M29 25L71 48M71 25L29 48M34 30H66L50 40Z"/>',
  RECON: '<ellipse cx="50" cy="36.5" rx="16" ry="8"/><path d="M29 48L71 25"/>',
  ARTILLERY: '<circle cx="50" cy="36.5" r="3" fill="currentColor"/>',
  SP_ARTILLERY: '<ellipse cx="50" cy="36.5" rx="17" ry="8"/><circle cx="50" cy="36.5" r="3" fill="currentColor"/>',
  ENGINEER: '<path d="M33 45V29H67V45M44 29V45M56 29V45"/>',
  HQ: '<path d="M29 25H71V48H29Z"/><path d="M44 25V48M56 25V48M29 32H71M29 41H71"/>',
  TRUCK: '<path d="M24 40V25H57V40ZM57 30H69L77 39V45H24V40M64 31V38H74"/><circle cx="35" cy="46" r="6"/><circle cx="66" cy="46" r="6"/>',
  SUPPLY: '<path d="M28 27H49V50H28ZM53 24H72V50H53ZM24 50H77"/><ellipse cx="38.5" cy="27" rx="10.5" ry="4"/>',
} as const;
const svgText = (x:number,y:number,value:unknown,cls=''):string => `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${escape(value)}</text>`;

const aircraftBody = (view: Extract<CounterViewModel, { kind: 'aircraft' }>): string => {
  // Type badge: a red triangle for Fighters, an oval for bombers and transports (as printed).
  const badge = view.type.includes('F')
    ? `<path class="air-badge fighter" d="M6 24L17 4L28 24Z"/>${svgText(17,21,'F','air-type')}`
    : `<ellipse class="air-badge" cx="18" cy="13" rx="14" ry="9"/>${svgText(18,18,view.type === 'TPT' ? 'Tpt' : view.type,'air-type')}`;
  return `<rect class="counter-paper nation-${view.nation}${view.reduced ? ' is-reduced' : ''}" width="100" height="100"/>
    <g class="counter-identification">${badge}${svgText(68,19,view.designation,'air-designation')}</g>
    <g class="counter-symbol air-silhouette"><path d="M50 26V70M24 46L50 40L76 46L76 50L50 47L24 50ZM40 66L50 63L60 66V69L50 68L40 69Z"/></g>
    <g class="counter-values"><rect class="air-range-box" x="64" y="26" width="32" height="18"/>${svgText(80,40,view.range,'air-range')}
    ${svgText(22,88,view.parenthesized ? `(${view.airCombat})` : view.airCombat,'counter-number')}${svgText(78,88,view.barrage,'counter-number')}</g>
    ${view.inactive ? `<g class="counter-state"><rect x="2" y="88" width="96" height="12"/>${svgText(50,98,'INACTIVE')}</g>` : ''}`;
};

const airBaseBody = (view: Extract<CounterViewModel, { kind: 'air-base' }>): string =>
  `<circle class="air-base-disc nation-${view.nation}" cx="50" cy="50" r="47"/>
    <g class="counter-symbol air-base-runways"><path d="M18 66L82 34M22 40L74 72M50 18V60"/></g>
    <g class="counter-values"><circle class="air-base-level" cx="72" cy="74" r="15"/>${svgText(72,84,view.level,'counter-number air-base-level-text')}</g>`;

export const counterSvgBody = (view: CounterViewModel): string => {
  if (view.redacted) return '<rect class="counter-paper concealed" width="100" height="100"/><path class="counter-unknown" d="M32 36C32 12 70 12 70 36C70 47 50 48 50 65M50 75V81"/>';
  if (view.kind === 'aircraft') return aircraftBody(view);
  if (view.kind === 'air-base') return airBaseBody(view);
  const c = view.counter;
  const text = svgText;
  const ma = view.step?.movementPointTicks == null ? '' : view.step.movementPointTicks / 4;
  const strength = view.step?.combatStrength;
  const flags = [view.mode && !['MOVE','COMBAT'].includes(view.mode) ? ({ RESERVE:'RES', STRAT:'STRAT', DG:'DG', EXPLOITATION:'EXP' } as Record<string,string>)[view.mode] : '',
    view.statuses.includes('status:out-of-supply') ? 'OOS' : ''].filter(Boolean);
  const strengthText = strength == null ? '' : c.defensiveOnly ? `(${strength})` : strength;
  let ratings = '';
  if (c.kind === 'HQ') ratings = text(50,84,`${view.step?.range}–${ma}`,'counter-number');
  else if (c.kind === 'SUPPLY') ratings = text(50,84,`${(view.quantity ?? 0) / 4} SP`,'counter-number');
  else {
    ratings = (c.kind === 'ARTILLERY' ? '<rect class="barrage-box" x="6" y="59" width="34" height="30"/>' : '')
      + text(24,85,c.kind === 'ARTILLERY' ? view.barrage : c.kind === 'TRANSPORT' ? view.transportPoints : strengthText,'counter-number')
      + (c.kind === 'TRANSPORT' ? '' : text(50,83,view.step?.actionRating ?? '', 'counter-ar'))
      + (c.kind === 'ARTILLERY' ? text(50,64,view.step?.range,'counter-range') : '')
      + (view.mobility === 'tracked' ? '<rect class="tracked-box" x="65" y="58" width="31" height="31"/>' : '')
      + text(80,85,ma,`counter-number mobility-${view.mobility}`);
  }
  // A truck's load gauge sits where the other counters print their Action Rating: empty, part-filled, or full.
  const gauge = c.kind === 'TRANSPORT' && view.load
    ? (() => {
      const ratio = view.load.capacity > 0 ? Math.min(1, view.load.tokens / view.load.capacity) : 0;
      const state = view.load.tokens <= 0 ? 'empty' : view.load.tokens >= view.load.capacity ? 'full' : 'part';
      return `<g class="load-gauge load-${state}"><rect class="load-track" x="38" y="67" width="24" height="18" rx="2"/>`
        + `${ratio > 0 ? `<rect class="load-fill" x="38" y="67" width="${(24 * ratio).toFixed(1)}" height="18" rx="2"/>` : ''}`
        + `${text(50, 80, view.load.tokens > 0 ? `${view.load.tokens}T` : '', 'counter-load-text')}</g>`;
    })() : '';
  return `<rect class="counter-paper nation-${c.nationality}" width="100" height="100"/>
    ${view.face?.id === 'move' ? '<path class="move-band" d="M3 9H97"/>' : ''}
    ${c.formationColor ? `<path class="formation-band" stroke="${escape(c.formationColor)}" d="M3 51H97"/>` : ''}
    <g class="counter-identification">${text(50,21,c.echelon,'counter-echelon')}${text(13,56,c.designation,'counter-designation')}${text(87,38,c.affiliation,'counter-affiliation')}
    ${c.showRe ? `<circle class="re-dot" cx="13" cy="28" r="10"/>${text(13,33,(view.step?.regimentalEquivalentTicks ?? 0)/4,'counter-re')}` : ''}</g>
    <g class="counter-symbol category-${c.combatCategory}">${!['TRUCK','SUPPLY'].includes(c.symbol) ? '<rect class="symbol-box" x="28" y="24" width="44" height="25"/>' : ''}${symbolPaths[c.symbol]}</g>
    <g class="counter-values">${ratings}</g>${gauge}
    ${flags.length ? `<g class="counter-state"><rect x="2" y="88" width="96" height="12"/>${text(50,98,flags.join(' · '))}</g>` : ''}`;
};
export const counterSvg = (view: CounterViewModel): string => `<svg class="unit-counter" viewBox="0 0 100 100" role="img" aria-label="${escape(view.label)}">${counterSvgBody(view)}</svg>`;
