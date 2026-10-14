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
    // 14.9a: a Transport prints its capacity (in half-Tokens here) where other aircraft print their Barrage Strength.
    capacity: typeof rating('rating:transport-capacity') === 'number' && step?.ratings.some(({ ratingDefinitionId }) => ratingDefinitionId === 'rating:transport-capacity') ? Number(rating('rating:transport-capacity')) : null,
    reduced: (piece.remainingSteps ?? full) < full,
    inactive: piece.statuses.includes('status:air-inactive'),
  };
};

/** 15.0: an Air Base counter shows its Level; an Air Strip (15.2) has none. */
const airBaseView = (definition: PieceDefinition, piece: CounterPiece) => {
  const level = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:air-base-level')?.value;
  return {
    redacted: false as const, kind: 'air-base' as const, label: definition.name, nation: nationOf(definition),
    level: typeof level === 'number' ? level : 1, strip: definition.facility?.facilityTypeDefinitionId === 'facility:air-strip',
    offMap: definition.facility?.facilityTypeDefinitionId === 'facility:off-map-airfield',
  };
};

/** 16.0a: a hedgehog counter shows its Level (1-4). The enemy sees it too (4.9a). */
const hedgehogView = (definition: PieceDefinition, piece: CounterPiece) => {
  const level = piece.statusValues?.find(({ statusDefinitionId }) => statusDefinitionId === 'status:hedgehog-level')?.value;
  return { redacted: false as const, kind: 'hedgehog' as const, label: definition.name, nation: nationOf(definition), level: typeof level === 'number' ? level : 1 };
};

/** "Pax" or "Eq": what a replacement counter is called for its kind (13.5). */
export const replacementAbbreviation = (definition: PieceDefinition): 'Pax' | 'Eq' => {
  const kind = definition.capabilities.find(({ id }) => id === 'REPLACEMENT')?.parameters.find(({ key }) => key === 'kind');
  return kind?.kind === 'TEXT' && kind.value === 'PAX' ? 'Pax' : 'Eq';
};

/**
 * 13.5: a replacement counter prints "Repl EQ" or "Repl PAX" and shows how many it holds ("?" when the count is hidden from
 * this seat, 4.9a). Pax prints 5 Leg MP; Eq prints 10 Truck MP, as their BTR counters do.
 */
const replacementView = (definition: PieceDefinition, piece: CounterPiece) =>
  ({ redacted: false as const, kind: 'replacement' as const, label: definition.name, abbreviation: replacementAbbreviation(definition), nation: nationOf(definition), mode: piece.mode, statuses: piece.statuses, quantity: piece.resourceQuantity === null || piece.resourceQuantity === undefined ? '?' : String(piece.resourceQuantity) });

/** The nation whose colours a player's pieces wear: Axis players are German, the rest American. */
export const playerNation = (players: readonly { readonly id: string; readonly sideDefinitionId: string }[], ownerId: string): 'US' | 'GERMAN' | undefined => {
  const side = players.find(({ id }) => id === ownerId)?.sideDefinitionId;
  return side === undefined ? undefined : String(side).includes('axis') ? 'GERMAN' : 'US';
};

/**
 * `ownerNation`, when given, is the nation of the player who holds the piece now: captured supply and trucks (9.14b-c)
 * change hands, so they wear their new owner's colours rather than the printed ones.
 */
export const counterView = (definition: PieceDefinition, piece: CounterPiece, ownerNation?: 'US' | 'GERMAN') => {
  if (definition.family === 'AIR') return aircraftView(definition, piece);
  if (['facility:air-base', 'facility:air-strip', 'facility:off-map-airfield'].includes(String(definition.facility?.facilityTypeDefinitionId))) return airBaseView(definition, piece);
  if (definition.facility?.facilityTypeDefinitionId === 'facility:hedgehog') return hedgehogView(definition, piece);
  if (definition.family === 'REPLACEMENT') return replacementView(definition, piece);
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
  const printed = ownerNation !== undefined && ['SUPPLY', 'TRANSPORT'].includes(definition.counter.kind) && ownerNation !== definition.counter.nationality
    ? { ...definition.counter, nationality: ownerNation } : definition.counter;
  const counter = named ? { ...printed, designation: slash < 0 ? ownName : ownName.slice(0, slash), affiliation: slash < 0 ? '' : ownName.slice(slash + 1) } : printed;
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
  // NATO anti-tank: an inverted V from the bottom corners to the top edge (BTR TD and PJ battalions).
  ANTI_TANK: '<path d="M29 48L50 25L71 48"/>',
  // BTR prints German assault-gun battalions with the letters AG inside the symbol box.
  ASSAULT_GUN: '<text class="symbol-letters" x="50" y="42" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor" stroke="none">AG</text>',
  // German heavy tank battalions print "Tgr" in the symbol box.
  TIGER: '<text class="symbol-letters" x="50" y="42" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" stroke="none">Tgr</text>',
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
/** A unit's state flags, each with the CSS key that colours it. DG and out of supply also mark the counter body (see `stateOverlay`). */
type StateFlag = { readonly key: 'dg' | 'oos' | 'res' | 'strat' | 'exp' | 'inactive'; readonly label: string };
const stateFlags = (mode: string | null | undefined, statuses: readonly string[]): StateFlag[] => {
  const flags: StateFlag[] = [];
  if (mode === 'DG') flags.push({ key: 'dg', label: 'DG' });
  if (statuses.includes('status:out-of-supply')) flags.push({ key: 'oos', label: 'OOS' });
  if (mode === 'RESERVE') flags.push({ key: 'res', label: 'RES' });
  if (mode === 'STRAT') flags.push({ key: 'strat', label: 'STRAT' });
  if (mode === 'EXPLOITATION') flags.push({ key: 'exp', label: 'EXP' });
  return flags;
};
/** The bottom strip: one solid colour segment per flag so each reads on its own, instead of one cream strip of small joined text. */
const stateBar = (flags: readonly StateFlag[]): string => {
  if (flags.length === 0) return '';
  const width = 96 / flags.length;
  return `<g class="counter-state">${flags.map(({ key, label }, index) => {
    const x = 2 + index * width;
    return `<rect class="counter-flag-${key}" x="${x.toFixed(1)}" y="85" width="${width.toFixed(1)}" height="15"/>${svgText(+(x + width / 2).toFixed(1), 97, label, 'counter-state-label')}`;
  }).join('')}</g>`;
};
/** Marks the counter body itself so a Disorganized or out-of-supply unit is told apart without reading text, at any zoom. */
const stateOverlay = (flags: readonly StateFlag[]): { readonly under: string; readonly over: string } => {
  const dg = flags.some(({ key }) => key === 'dg');
  const oos = flags.some(({ key }) => key === 'oos');
  return {
    under: dg ? '<defs><pattern id="counter-dg-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="12" fill="#c4161c" fill-opacity=".38"/></pattern></defs><rect class="counter-dg-hatch" width="100" height="100" fill="url(#counter-dg-hatch)"/>' : '',
    over: `${dg ? '<rect class="counter-frame-dg" x="3" y="3" width="94" height="94"/>' : ''}${oos ? '<rect class="counter-frame-oos" x="3" y="3" width="94" height="94"/>' : ''}`,
  };
};
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
// TODO(transport-art): the C-47, C-47+Gldr and Ju.52 silhouettes are drawn after the VASSAL counter faces (75 x 64 px) by eye, not
// traced per row like the models above. Closing evidence: a side-by-side review against the counter images (docs/roadmap/17-counter-fidelity-wbs.md).
const planeArt: Readonly<Record<string, PlaneArt>> = {
  // A glider keeps the tow's place in the stack of art: listed before 'C-47' so its longer name matches first.
  'C-47+Gldr': { paint: 'od', rangeY: 22, body: pl('M10 36C10 33.5 12 33 15 33L45 32H51L81 33C84 33 86 33.5 86 36C86 38.5 84 39 81 39L51 41.5H45L15 39C12 39 10 38.5 10 36Z')
    + pl('M44.5 18C44.5 13.5 51.5 13.5 51.5 18L52 38L49.5 58H46.5L44 38Z') + pl('M37 53C37 51.5 43 51.5 48 51.5C53 51.5 59 51.5 59 53V56.5H37Z')
    + pl('M31 28C31 25 35.5 25 35.5 28V40H31ZM60.5 28C60.5 25 65 25 65 28V40H60.5Z') + prop('M28.5 25H38M58 25H67.5')
    + '<path class="plane-stripe" d="M48 58V66"/>' + pl('M26 80C26 72 40 67 48 67C56 67 70 72 70 80C70 86 58 87 48 87C38 87 26 86 26 80Z', ' od')
    + usStar(18, 36) + usStar(78, 36) },
  'C-47': { paint: 'od', rangeY: 22, body: pl('M10 44C10 41.5 12 41 15 41L45 40H51L81 41C84 41 86 41.5 86 44C86 46.5 84 47 81 47L51 49.5H45L15 47C12 47 10 46.5 10 44Z')
    + pl('M44.5 20C44.5 15.5 51.5 15.5 51.5 20L52 46L49.5 82H46.5L44 46Z') + pl('M35 74C35 72.5 42 72.5 48 72.5C54 72.5 61 72.5 61 74V78.5H35Z')
    + pl('M31 35C31 32 35.5 32 35.5 35V48H31ZM60.5 35C60.5 32 65 32 65 35V48H60.5Z') + prop('M28.5 32H38M58 32H67.5') + usStar(18, 44) + usStar(78, 44) },
  'Ju.52': { paint: 'luft', rangeY: 22, body: pl('M9 46C9 43 11 42.5 14 42.5L45 41.5H51L82 42.5C85 42.5 87 43 87 46C87 49 85 49.5 82 49.5L51 52H45L14 49.5C11 49.5 9 49 9 46Z')
    + '<path class="plane-stripe" d="M20 42.2V49.8M28 42V50M36 41.8V50.2M60 41.8V50.2M68 42V50M76 42.2V49.8"/>'
    + pl('M44 22C44 17.5 52 17.5 52 22L52.5 48L50 82H46L43.5 48Z') + pl('M34 74C34 72.5 42 72.5 48 72.5C54 72.5 62 72.5 62 74V78.5H34Z')
    + pl('M46 14.5C46 12.5 50 12.5 50 14.5V22H46Z') + pl('M30 38C30 35 34.5 35 34.5 38V50H30ZM61.5 38C61.5 35 66 35 66 38V50H61.5Z')
    + prop('M43 12H53M27.5 35H37M59 35H68.5') + balkenkreuz(20, 46) + balkenkreuz(76, 46) },
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
    ${airCombat}${view.capacity === null ? svgText(79,87,view.barrage,'counter-number air-number') : svgText(79,87,capacityText(view.capacity),'counter-number air-number')}</g>
    ${stateBar(view.inactive ? [{ key: 'inactive', label: 'INACTIVE' }] : [])}`;
};

/** Transport capacity as the counter prints it: 1T, 1/2T, 2T (the value is in half-Tokens). */
const capacityText = (halfTokens: number): string => halfTokens % 2 === 0 ? `${halfTokens / 2}T` : `${(halfTokens - 1) / 2 === 0 ? '' : (halfTokens - 1) / 2}${(halfTokens - 1) / 2 === 0 ? '' : ' '}1/2T`;

// An off-map airfield (game-specific) prints "OFF MAP" where an Air Base prints its Level.
const airBaseBody = (view: Extract<CounterViewModel, { kind: 'air-base' }>): string => view.offMap
  ? `<circle class="air-base-disc nation-${view.nation}" cx="50" cy="50" r="47"/>
    <g class="counter-symbol air-base-runways"><path d="M18 66L82 34M22 40L74 72M50 18V60"/></g>
    <g class="counter-values">${svgText(50,86,'OFF MAP','counter-number air-strip-text')}</g>`
  : view.strip
  ? `<circle class="air-base-disc air-strip nation-${view.nation}" cx="50" cy="50" r="47"/>
    <g class="counter-symbol air-base-runways"><path d="M20 62L80 38"/></g>
    <g class="counter-values">${svgText(50,84,'STRIP','counter-number air-strip-text')}</g>`
  : `<circle class="air-base-disc nation-${view.nation}" cx="50" cy="50" r="47"/>
    <g class="counter-symbol air-base-runways"><path d="M18 66L82 34M22 40L74 72M50 18V60"/></g>
    <g class="counter-values"><circle class="air-base-level" cx="72" cy="74" r="15"/>${svgText(72,84,view.level,'counter-number air-base-level-text')}</g>`;

// As the BTR module draws it (images/misc_hog-1..4.png): a tan counter, a dark toothed ring (wire and obstacles) and the Level
// in a white disc at its centre.
const HEDGEHOG_TEETH = 'M50.0 10.0L55.9 20.6L65.3 13.0L66.7 25.1L78.3 21.7L74.9 33.3L87.0 34.7L79.4 44.1L90.0 50.0L79.4 55.9L87.0 65.3L74.9 66.7L78.3 78.3L66.7 74.9L65.3 87.0L55.9 79.4L50.0 90.0L44.1 79.4L34.7 87.0L33.3 74.9L21.7 78.3L25.1 66.7L13.0 65.3L20.6 55.9L10.0 50.0L20.6 44.1L13.0 34.7L25.1 33.3L21.7 21.7L33.3 25.1L34.7 13.0L44.1 20.6Z';
const hedgehogBody = (view: Extract<CounterViewModel, { kind: 'hedgehog' }>): string =>
  `<rect class="counter-paper hedgehog-paper nation-${view.nation}" width="100" height="100"/>
    <g class="counter-symbol hedgehog-ring"><path d="${HEDGEHOG_TEETH}"/></g>
    <g class="counter-values"><circle class="hedgehog-level" cx="50" cy="50" r="24"/>${svgText(50,62,view.level,'counter-number hedgehog-level-text')}</g>`;

// As the BTR module draws it (images/German EQ Replacement.png, US-Repl-EQ.png): "Repl" rotated beside a boxed "EQ" tied to it
// by a short leader, an "A" before it on the US counter, and the printed 0-0-10 ratings below (a white 0, a superscript 0, and a
// red 10 on a yellow box). Pax has a plain white 5 (Leg MP) instead.
const squeezed = (element: string, length: number): string => element.replace('<text ', `<text textLength="${length}" lengthAdjust="spacingAndGlyphs" `);
// The printed 0-0-10 never changes, so its digits are drawn as shapes. As text they took whatever font the browser had, and
// the widths forced to fit a narrow face squashed a wider fallback (Arial, where Arial Narrow is not installed) into slivers.
/** A condensed "0": a stadium-shaped ring `width` × `height` around (cx, cy), `stroke` thick (filled even-odd). */
const zeroDigit = (cx: number, cy: number, width: number, height: number, stroke: number): string => {
  const outer = width / 2;
  const inner = outer - stroke;
  const top = cy - height / 2 + outer;
  const bottom = cy + height / 2 - outer;
  const loop = (radius: number): string => `M${cx - radius} ${top}A${radius} ${radius} 0 0 1 ${cx + radius} ${top}V${bottom}A${radius} ${radius} 0 0 1 ${cx - radius} ${bottom}Z`;
  return loop(outer) + loop(inner);
};
const REPLACEMENT_ZERO = zeroDigit(28, 65.5, 19, 32, 6.5);
const replacementBody = (view: Extract<CounterViewModel, { kind: 'replacement' }>): string =>
  `<rect class="counter-paper replacement nation-${view.nation}" width="100" height="100"/>
    <g class="counter-identification">${view.nation === 'US' ? svgText(11.5,29,'A','eq-army') : ''}${squeezed(svgText(30.5,28,'Repl','eq-repl'), 30).replace('<text ', '<text transform="rotate(-90 30.5 28)" ')}<path class="eq-leader" d="M31 21.5H37.5"/></g>
    <g class="counter-symbol"><rect class="eq-box nation-${view.nation}" x="37.5" y="16.5" width="33.5" height="26"/>${squeezed(svgText(54,38,view.abbreviation.toUpperCase(),'eq-label'), 21)}</g>
    <g class="counter-values"><path class="eq-digit eq-shadow" transform="translate(1.5 1.5)" d="${REPLACEMENT_ZERO}"/><path class="eq-digit eq-white" d="${REPLACEMENT_ZERO}"/><path class="eq-digit eq-superscript" d="${zeroDigit(43.5, 56, 10, 18, 3.5)}"/>
    ${view.abbreviation === 'Eq' ? `<rect class="eq-move-box" x="50" y="49.5" width="34" height="36.5"/><path class="eq-digit eq-move" d="M56.5 50H62.5V81.5H56.5V57L52 59.5V54Z${zeroDigit(74.5, 65.75, 17, 31.5, 5.5)}"/>` : '<path class="eq-digit eq-white" d="M56 50H77V56H62V62H69C83 62 82 82 68 82C61 82 56 78 55 73H62C63 80 75 77 74 70C73 63 64 65 61 68H56Z"/>'}</g>
    <g class="counter-quantity"><circle class="eq-count-disc" cx="87" cy="13" r="10"/>${svgText(87,18,view.quantity,'eq-count')}</g>`;

// A corps HQ prints its nation's flag where other counters print the unit symbol (BTR S01 R10 C02 and the other HQ images):
// the flag sits right of the rotated formation name, under a heavy "XXX" and over a large "range-movement" rating. The US
// canton's stars are a plain dot grid, and the German flag is the black cross on white with red corners as the HQ images show it.
const HQ_FLAG = { x: 30, y: 17, w: 55, h: 40 } as const;
const hqFlag = (nationality: string): string => {
  const { x, y, w, h } = HQ_FLAG;
  const frame = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#151810" stroke-width="1.6"/>`;
  const ground = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f4f1e6" stroke="none"/>`;
  if (nationality === 'GERMAN') {
    const cw = 16, ch = 13;
    const corners = [[x, y], [x + w - cw, y], [x, y + h - ch], [x + w - cw, y + h - ch]]
      .map(([cx, cy]) => `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="#c4161c" stroke="none"/>`).join('');
    return `${ground}${corners}<rect x="${x}" y="${y + h / 2 - 6}" width="${w}" height="12" fill="#151810" stroke="none"/>`
      + `<rect x="${x + w / 2 - 7}" y="${y}" width="14" height="${h}" fill="#151810" stroke="none"/>${frame}`;
  }
  const stripe = h / 13;
  const stripes = Array.from({ length: 7 }, (_, index) => `<rect x="${x}" y="${(y + index * 2 * stripe).toFixed(2)}" width="${w}" height="${stripe.toFixed(2)}" fill="#a3182b" stroke="none"/>`).join('');
  const canton = { w: w * 0.4, h: stripe * 7 };
  const stars = Array.from({ length: 12 }, (_, index) => `<circle cx="${(x + 3 + (index % 4) * ((canton.w - 6) / 3)).toFixed(2)}" cy="${(y + 3.2 + Math.floor(index / 4) * ((canton.h - 6.4) / 2)).toFixed(2)}" r=".9" fill="#fff" stroke="none"/>`).join('');
  return `${ground}${stripes}<rect x="${x}" y="${y}" width="${canton.w}" height="${canton.h.toFixed(2)}" fill="#1c2a58" stroke="none"/>${stars}${frame}`;
};

export const counterSvgBody = (view: CounterViewModel): string => {
  if (view.redacted) return '<rect class="counter-paper concealed" width="100" height="100"/><path class="counter-unknown" d="M32 36C32 12 70 12 70 36C70 47 50 48 50 65M50 75V81"/>';
  if (view.kind === 'aircraft') return aircraftBody(view);
  if (view.kind === 'air-base') return airBaseBody(view);
  if (view.kind === 'hedgehog') return hedgehogBody(view);
  if (view.kind === 'replacement') {
    const flags = stateFlags(view.mode, view.statuses);
    const overlay = stateOverlay(flags);
    return replacementBody(view) + overlay.over + stateBar(flags);
  }
  const c = view.counter;
  const text = svgText;
  const ma = view.step?.movementPointTicks == null ? '' : view.step.movementPointTicks / 4;
  const strength = view.step?.combatStrength;
  const flags = stateFlags(view.mode, view.statuses);
  const overlay = stateOverlay(flags);
  const moveBand = view.face?.id === 'move' ? '<path class="move-band" d="M3 9H97"/>' : '';
  if (c.kind === 'HQ') {
    // The HQ's own number ("3", "39 Pz") is printed rotated beside the flag, as the board-game counter does; an HQ belongs to no formation.
    const number = c.designation;
    const rating = `${view.step?.range}-${ma}`;
    const squeeze = (element: string, length: number) => element.replace('<text ', `<text textLength="${length}" lengthAdjust="spacingAndGlyphs" `);
    return `<rect class="counter-paper nation-${c.nationality}" width="100" height="100"/>${overlay.under}
    ${moveBand}
    <g class="counter-identification">${squeeze(text(HQ_FLAG.x + HQ_FLAG.w / 2, 14, c.echelon, 'hq-echelon'), 9 * c.echelon.length)}${number ? squeeze(text(21, 37, number, 'hq-designation'), number.length > 3 ? 40 : 17 * number.length) : ''}</g>
    <g class="counter-symbol hq-flag">${hqFlag(c.nationality)}</g>
    <g class="counter-values">${squeeze(text(56, flags.length ? 84 : 90, rating, flags.length ? 'hq-rating hq-rating-flagged' : 'hq-rating'), rating.length > 3 ? 56 : 44)}</g>
    ${overlay.over}${stateBar(flags)}`;
  }
  // The left-hand value (strength / barrage / transport points) must not run into the Action Rating printed at x=50, so
  // multi-glyph values are squeezed into the left third of the face and centred slightly further left.
  const leftValue = (value: unknown): string => {
    const element = text(String(value).length > 1 ? 22 : 24, 85, value, 'counter-number');
    const length = String(value).length;
    return length > 1 ? element.replace('<text ', `<text textLength="${length === 2 ? 34 : 40}" lengthAdjust="spacingAndGlyphs" `) : element;
  };
  const strengthText = strength == null ? '' : c.defensiveOnly ? `(${strength})` : strength;
  let ratings = '';
  // An enemy dump's size is hidden (null in the projection): print "? SP" (an emptied dump is removed, so 0 is never real).
  if (c.kind === 'SUPPLY') {
    const label = `${view.quantity == null ? '?' : view.quantity / 4} SP`;
    // At 33px a label such as "0.5 SP" is wider than the counter face, so squeeze anything over four glyphs into the face.
    ratings = label.length > 4
      ? text(50,84,label,'counter-number').replace('<text ', '<text textLength="80" lengthAdjust="spacingAndGlyphs" ')
      : text(50,84,label,'counter-number');
  }
  else {
    ratings = (c.kind === 'ARTILLERY' ? '<rect class="barrage-box" x="6" y="59" width="34" height="30"/>' : '')
      + leftValue(c.kind === 'ARTILLERY' ? view.barrage : c.kind === 'TRANSPORT' ? view.transportPoints : strengthText)
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
  return `<rect class="counter-paper nation-${c.nationality}" width="100" height="100"/>${overlay.under}
    ${moveBand}
    ${c.formationColor ? `<path class="formation-band" stroke="${escape(c.formationColor)}" d="M3 51H97"/>` : ''}
    <g class="counter-identification">${text(50,20,c.echelon,'counter-echelon')}${fit(text(20,57,c.designation,'counter-designation'), c.designation, 32)}${fit(text(88,34,c.affiliation,'counter-affiliation'), c.affiliation, 44)}
    ${c.showRe ? `<circle class="re-dot" cx="13" cy="14" r="9"/>${text(13,19,(view.step?.regimentalEquivalentTicks ?? 0)/4,'counter-re')}` : ''}</g>
    <g class="counter-symbol category-${c.combatCategory}">${!['TRUCK','SUPPLY'].includes(c.symbol) ? '<rect class="symbol-box" x="28" y="24" width="44" height="25"/>' : ''}${symbolPaths[c.symbol]}</g>
    <g class="counter-values">${ratings}</g>${gauge}
    ${overlay.over}${stateBar(flags)}`;
};
export const counterSvg = (view: CounterViewModel): string => `<svg class="unit-counter" viewBox="0 0 100 100" role="img" aria-label="${escape(view.label)}">${counterSvgBody(view)}</svg>`;
