import type { PieceDefinition } from '../domain/piece/index.js';
import type { ProjectedPiece } from '../rules/index.js';

export type CounterLod = 'full' | 'ratings' | 'symbol';
export const counterLod = (screenPixels: number): CounterLod => screenPixels >= 58 ? 'full' : screenPixels >= 38 ? 'ratings' : 'symbol';
const escape = (value: unknown): string => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const counterView = (definition: PieceDefinition, piece: Pick<ProjectedPiece, 'currentFaceId' | 'remainingSteps' | 'resourceQuantity' | 'mode' | 'statuses' | 'redacted'>) => {
  // A visible enemy counter shows its face; steps lost are hidden (4.9a), so show the printed face.
  if (piece.redacted && piece.currentFaceId === null && definition.counter?.kind !== 'SUPPLY') return { redacted: true as const, label: 'Enemy unit' };
  if (!definition.counter) throw new Error(`Counter definition missing: ${definition.id}`);
  const face = definition.faces.find(({id}) => id === piece.currentFaceId);
  const fullSteps = Math.max(0, ...(face?.steps.map(({ remainingSteps }) => remainingSteps) ?? []));
  const step = face?.steps.find(({remainingSteps}) => remainingSteps === (piece.remainingSteps ?? fullSteps));
  if (definition.counter.kind !== 'SUPPLY' && (!face || !step)) throw new Error(`Counter face/step missing: ${definition.id}`);
  return { redacted: false as const, label: definition.name, counter: definition.counter, face, step,
    mode: piece.mode, statuses: piece.statuses, quantity: piece.resourceQuantity,
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
export const counterSvgBody = (view: CounterViewModel): string => {
  if (view.redacted) return '<rect class="counter-paper concealed" width="100" height="100"/><path class="counter-unknown" d="M32 36C32 12 70 12 70 36C70 47 50 48 50 65M50 75V81"/>';
  const c = view.counter;
  const text = (x:number,y:number,value:unknown,cls=''):string => `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle">${escape(value)}</text>`;
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
      + text(24,85,c.kind === 'ARTILLERY' ? view.barrage : c.kind === 'TRANSPORT' ? c.transportPoints : strengthText,'counter-number')
      + (c.kind === 'TRANSPORT' ? '' : text(50,83,view.step?.actionRating ?? '', 'counter-ar'))
      + (c.kind === 'ARTILLERY' ? text(50,64,view.step?.range,'counter-range') : '')
      + (view.mobility === 'tracked' ? '<rect class="tracked-box" x="65" y="58" width="31" height="31"/>' : '')
      + text(80,85,ma,`counter-number mobility-${view.mobility}`);
  }
  return `<rect class="counter-paper nation-${c.nationality}" width="100" height="100"/>
    ${view.face?.id === 'move' ? '<path class="move-band" d="M3 9H97"/>' : ''}
    ${c.formationColor ? `<path class="formation-band" stroke="${escape(c.formationColor)}" d="M3 51H97"/>` : ''}
    <g class="counter-identification">${text(50,21,c.echelon,'counter-echelon')}${text(13,56,c.designation,'counter-designation')}${text(87,38,c.affiliation,'counter-affiliation')}
    ${c.showRe ? `<circle class="re-dot" cx="13" cy="28" r="10"/>${text(13,33,(view.step?.regimentalEquivalentTicks ?? 0)/4,'counter-re')}` : ''}</g>
    <g class="counter-symbol category-${c.combatCategory}">${!['TRUCK','SUPPLY'].includes(c.symbol) ? '<rect class="symbol-box" x="28" y="24" width="44" height="25"/>' : ''}${symbolPaths[c.symbol]}</g>
    <g class="counter-values">${ratings}</g>
    ${flags.length ? `<g class="counter-state"><rect x="2" y="88" width="96" height="12"/>${text(50,98,flags.join(' · '))}</g>` : ''}`;
};
export const counterSvg = (view: CounterViewModel): string => `<svg class="unit-counter" viewBox="0 0 100 100" role="img" aria-label="${escape(view.label)}">${counterSvgBody(view)}</svg>`;
