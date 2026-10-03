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
  // 20.0: a Breakdown shares its generic counter but prints its own number and division ("1/101.Abn": 1 and 101.Abn).
  const ownName = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:unit-name')?.value;
  const named = typeof ownName === 'string' && ownName.length > 0;
  const slash = named ? ownName.indexOf('/') : -1;
  const counter = named ? { ...definition.counter, designation: slash < 0 ? ownName : ownName.slice(0, slash), affiliation: slash < 0 ? '' : ownName.slice(slash + 1) } : definition.counter;
  return { redacted: false as const, kind: 'unit' as const, label: named ? ownName : definition.name, counter, face, step,
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
  // NATO (APP-6) airborne infantry, as the BTR counters print it: the infantry cross plus a small scalloped parachute
  // canopy resting on the bottom edge inside the symbol box.
  AIRBORNE: '<path d="M29 25L71 48M71 25L29 48"/><path d="M34 47C35 36 65 36 66 47Q58 42 50 47Q42 42 34 47Z"/>',
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
/** Squeezes a long label (more than five glyphs) into `length` user units so it never runs into the counter's other prints. */
const fit = (textElement: string, value: unknown, length: number): string =>
  String(value).length > 5 ? textElement.replace('<text ', `<text textLength="${length}" lengthAdjust="spacingAndGlyphs" `) : textElement;

// Top-down aircraft art, traced from the BTR VASSAL counter images (per-row pixel extents of each model's plane, scaled to
// the 100-unit counter). `paint` is the printed finish; `rangeY` is where the counter prints its yellow range box, which
// sits under the model name or, on the long-winged US fighters, under the right wing.
type PlaneArt = { readonly paint: 'od' | 'metal' | 'luft'; readonly rangeY: number; readonly body: string };
const usStar = (x: number, y: number): string => `<circle class="roundel-us" cx="${x}" cy="${y}" r="2.8"/><circle class="roundel-star" cx="${x}" cy="${y}" r="1.1"/>`;
const balkenkreuz = (x: number, y: number): string => `<path class="roundel-de" d="M${x - 3} ${y}H${x + 3}M${x} ${y - 3}V${y + 3}"/>`;
const pl = (d: string, extra = ''): string => `<path class="pl${extra}" d="${d}"/>`;
const prop = (d: string): string => `<path class="plane-prop" d="${d}"/>`;
const fw190Wing = pl('M16 45C16 42 18 41 22 41L44 39.5H52L74 41C78 41 80 42 80 45C80 48 78 49 74 49L52 51H44L22 49C18 49 16 48 16 45Z')
  + pl('M37 77.5C37 74.5 44 74.5 48 74.5C52 74.5 59 74.5 59 77.5C59 80.5 52 81 48 81C44 81 37 80.5 37 77.5Z') + balkenkreuz(25, 45) + balkenkreuz(71, 45);
const planeArt: Readonly<Record<string, PlaneArt>> = {
  'P-38': { paint: 'od', rangeY: 49, body: pl('M7 42C7 39.5 9 39 12 39L44 38H52L84 39C87 39 89 39.5 89 42C89 44 87 45 84 45L52 48H44L12 45C9 45 7 44 7 42Z')
    + pl('M32 33C32 28.5 37 28.5 37 33V80H32ZM59 33C59 28.5 64 28.5 64 33V80H59Z') + pl('M32 73.5H64V78H32Z')
    + pl('M45.5 25C45.5 19.5 50.5 19.5 50.5 25V55C50.5 58 45.5 58 45.5 55Z') + prop('M28 29H41M55 29H68') + usStar(16, 42) + usStar(80, 42) },
  'P-47': { paint: 'metal', rangeY: 49, body: pl('M14 42C14 37 28 35.5 44 36.5H51C67 35.5 81 37 81 42C81 46 68 47.5 51 48H44C27 47.5 14 46 14 42Z')
    + '<path class="plane-stripe" d="M27 36.3V47.2M30.5 36.2V47.6M64.5 36.2V47.6M68 36.3V47.2"/>'
    + pl('M44 26C44 22.5 51 22.5 51 26L52 40L50 79H45L43 40Z', ' od') + pl('M36 74C36 71.5 44 71.5 47.5 71.5C51 71.5 59 71.5 59 74C59 76.5 51 77 47.5 77C44 77 36 76.5 36 74Z', ' od')
    + prop('M40 23.5H55') + usStar(21, 41.5) + usStar(74, 41.5) },
  'P-51': { paint: 'metal', rangeY: 49, body: pl('M16 39L44 36.5H50L78 39C79.5 39.3 79.5 44.5 78 45L50 48H44L16 45C14.5 44.5 14.5 39.3 16 39Z')
    + pl('M44.5 26C44.5 22.5 49.5 22.5 49.5 26L50.5 42L48.5 69H45.5L43.5 42Z') + pl('M37 66.5L47 64.5L57 66.5V69.5H37Z')
    + prop('M39 23H55') + usStar(21, 42) + usStar(73, 42) },
  'A-20': { paint: 'od', rangeY: 23, body: pl('M12 43C12 40 14 39.5 17 39.5L45 38H51L79 39.5C82 39.5 84 40 84 43C84 45.5 82 46 79 46L51 49H45L17 46C14 46 12 45.5 12 43Z')
    + pl('M38 71C38 69 44 69 48 69C52 69 58 69 58 71V75H38Z') + pl('M45 18C45 13.5 51 13.5 51 18L51.5 45L49.5 77H46.5L44.5 45Z')
    + pl('M33 33C33 29 38 29 38 33V50H33ZM58 33C58 29 63 29 63 33V50H58Z') + prop('M30 29.5H41M55 29.5H66') + usStar(20, 42.5) + usStar(76, 42.5) },
  'A-26': { paint: 'od', rangeY: 23, body: pl('M13 45.5C13 43.5 14 43 17 43L45 42H51L79 43C82 43 83 43.5 83 45.5C83 47.5 82 48 79 48L51 51H45L17 48C14 48 13 47.5 13 45.5Z')
    + pl('M37.5 71.5C37.5 70 44 70 48 70C52 70 58.5 70 58.5 71.5V75.5H37.5Z') + pl('M45.5 27C45.5 23 50.5 23 50.5 27L51 47L49.5 77H46.5L45 47Z')
    + pl('M36.5 39C36.5 35.5 41.5 35.5 41.5 39V53H36.5ZM54.5 39C54.5 35.5 59.5 35.5 59.5 39V53H54.5Z') + prop('M34 35.5H44M52 35.5H62') + usStar(22, 45.5) + usStar(74, 45.5) },
  'B-26': { paint: 'od', rangeY: 23, body: pl('M14 46C14 44 15.5 43.5 18 43.5L44.5 42.5H51.5L78 43.5C80.5 43.5 82 44 82 46C82 48 80.5 48.5 78 48.5L51.5 51.5H44.5L18 48.5C15.5 48.5 14 48 14 46Z')
    + pl('M36 73C36 71 43 71 48 71C53 71 60 71 60 73V77H36Z') + pl('M44.5 26C44.5 20 51.5 20 51.5 26L52 50L49.5 79H46.5L44 50Z')
    + pl('M34 36C34 32 39 32 39 36V53H34ZM57 36C57 32 62 32 62 36V53H57Z') + prop('M31 32.5H42M54 32.5H65') + usStar(21, 46) + usStar(75, 46) },
  'Bf.109': { paint: 'luft', rangeY: 28, body: pl('M17 47C17 43 20 42 26 42L45 41H53L72 42C78 42 81 43 81 47C81 51 77 52 72 52L53 55H45L26 52C21 52 17 51 17 47Z')
    + pl('M39 82.5C39 80 45 80 49 80C53 80 59 80 59 82.5C59 85 53 85 49 85C45 85 39 85 39 82.5Z') + pl('M46.5 31C46.5 28 51.5 28 51.5 31L52 46L50.5 85H47.5L46 46Z')
    + prop('M42 29H56') + '<circle class="plane-spinner" cx="49" cy="29.5" r="2.2"/>' + balkenkreuz(26, 47) + balkenkreuz(72, 47) },
  'Fw-190d': { paint: 'luft', rangeY: 27, body: `<g transform="translate(0 1.5)">${fw190Wing}</g>`
    + pl('M43.5 28C43.5 22.5 52.5 22.5 52.5 28L52.5 51.5L49.5 82H46.5L43.5 51.5Z') + prop('M40 23H56') },
  'Fw-190': { paint: 'luft', rangeY: 26, body: fw190Wing + pl('M42.5 30C42.5 25 53.5 25 53.5 30L52 50L49.5 80H46.5L44 50Z') + prop('M40 26H56') },
  'Ju.88': { paint: 'luft', rangeY: 26, body: pl('M16 46C16 43.5 18 42.5 22 42.5L45 41.5H51L74 42.5C78 42.5 80 43.5 80 46C80 48.5 78 49 74 49L51 51.5H45L22 49C18 49 16 48.5 16 46Z')
    + pl('M37 72.5C37 70 44 70 48 70C52 70 59 70 59 72.5C59 75 52 75 48 75C44 75 37 75 37 72.5Z') + pl('M45.5 34C45.5 29.5 50.5 29.5 50.5 34L51 48L49 76H47L45 48Z')
    + pl('M34.5 37C34.5 33 39.5 33 39.5 37V50H34.5ZM56.5 37C56.5 33 61.5 33 61.5 37V50H56.5Z') + prop('M32 33H42M54 33H64') + balkenkreuz(24, 46) + balkenkreuz(72, 46) },
};
/** The art for a printed model ("Fw-190a" uses the Fw-190 art); an unknown model falls back to its side's fighter or bomber. */
const planeArtFor = (view: Extract<CounterViewModel, { kind: 'aircraft' }>, fighter: boolean): PlaneArt => {
  const model = Object.keys(planeArt).find((key) => view.designation.startsWith(key));
  if (model) return planeArt[model]!;
  return planeArt[view.nation === 'GERMAN' ? (fighter ? 'Fw-190' : 'Ju.88') : (fighter ? 'P-47' : 'B-26')]!;
};

const aircraftBody = (view: Extract<CounterViewModel, { kind: 'aircraft' }>): string => {
  // Type badge: a red triangle (yellow rim, white F) for Fighters, a yellow oval (red rim) for bombers and transports.
  const fighter = view.type.includes('F');
  const badge = fighter
    ? `<path class="air-badge fighter" d="M4 27L14.5 6L25 27Z"/>${svgText(14.5,24.5,'F','air-type')}`
    : `<ellipse class="air-badge" cx="17" cy="15" rx="13" ry="7"/>${svgText(17,19.5,view.type === 'TPT' ? 'Tpt' : view.type,'air-type')}`;
  const art = planeArtFor(view, fighter);
  // The printed model name and range are tall condensed type, narrower than Arial Narrow: squeeze them to the printed widths.
  const rangeWidth = 9 * String(view.range).length + 3;
  const airCombat = view.parenthesized
    ? svgText(19,87,`(${view.airCombat})`,'counter-number air-number').replace('<text ', '<text textLength="34" lengthAdjust="spacingAndGlyphs" ')
    : svgText(19,87,view.airCombat,'counter-number air-number');
  return `<rect class="counter-paper air nation-${view.nation}${view.reduced ? ' is-reduced' : ''}" width="100" height="100"/>
    <g class="counter-identification">${badge}${svgText(90,22,view.designation,'air-designation').replace('<text ', `<text textLength="${(5.2 * view.designation.length + 6).toFixed(1)}" lengthAdjust="spacingAndGlyphs" `)}</g>
    <g class="counter-symbol air-silhouette paint-${art.paint}">${art.body}</g>
    <g class="counter-values"><rect class="air-range-box" x="${89 - rangeWidth}" y="${art.rangeY}" width="${rangeWidth}" height="15"/>${svgText(89 - rangeWidth / 2,art.rangeY + 12.5,view.range,'air-range')}
    ${airCombat}${svgText(79,87,view.barrage,'counter-number air-number')}</g>
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
  // A formation HQ prints its formation's short name ("82.Abn") in the symbol box, as the board-game counter does; its unit name is "HQ / 82.Abn".
  const hqFormation = c.kind === 'HQ' ? view.label.split(' / ').slice(1).join(' / ') : '';
  const strengthText = strength == null ? '' : c.defensiveOnly ? `(${strength})` : strength;
  let ratings = '';
  if (c.kind === 'HQ') ratings = text(50,84,`${view.step?.range}–${ma}`,'counter-number');
  // An enemy dump's size is hidden (null in the projection): print "? SP", never a made-up "0 SP".
  else if (c.kind === 'SUPPLY') ratings = text(50,84,`${view.quantity == null ? '?' : view.quantity / 4} SP`,'counter-number');
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
    <g class="counter-identification">${text(50,20,c.echelon,'counter-echelon')}${fit(text(20,57,c.designation,'counter-designation'), c.designation, 32)}${fit(text(88,34,c.affiliation,'counter-affiliation'), c.affiliation, 44)}
    ${c.showRe ? `<circle class="re-dot" cx="13" cy="14" r="9"/>${text(13,19,(view.step?.regimentalEquivalentTicks ?? 0)/4,'counter-re')}` : ''}</g>
    <g class="counter-symbol category-${c.combatCategory}">${!['TRUCK','SUPPLY'].includes(c.symbol) ? '<rect class="symbol-box" x="28" y="24" width="44" height="25"/>' : ''}${hqFormation ? text(50,43,hqFormation,'hq-formation').replace('<text ', `<text${hqFormation.length > 5 ? ` textLength="40" lengthAdjust="spacingAndGlyphs"` : ''} `) : symbolPaths[c.symbol]}</g>
    <g class="counter-values">${ratings}</g>${gauge}
    ${flags.length ? `<g class="counter-state"><rect x="2" y="88" width="96" height="12"/>${text(50,98,flags.join(' · '))}</g>` : ''}`;
};
export const counterSvg = (view: CounterViewModel): string => `<svg class="unit-counter" viewBox="0 0 100 100" role="img" aria-label="${escape(view.label)}">${counterSvgBody(view)}</svg>`;
