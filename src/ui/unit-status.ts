import type { ProjectedPiece } from '../rules/index.js';
import type { UiSnapshot } from './model.js';
import { pieceDefinition } from './presenter.js';

/** One line of the selected unit's Status panel: what the board game shows with markers, written out. */
export interface StatusRow {
  readonly key: string;
  /** Short mark drawn in the panel, like the marker printed on a counter; everything else is in the tooltip. */
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  /** `bad` is an adverse state, `warn` a limitation, `ok` a good one; `none` is neutral. */
  readonly tone: 'ok' | 'warn' | 'bad' | 'none';
  /** Rule effect in one sentence, shown under the value. */
  readonly note?: string;
  readonly rule?: string;
}

/** Combat and Move have no marker: the side of the counter showing is the mode (5.2), and the selection card names it. */
const MODE_ROWS: Readonly<Record<string, Pick<StatusRow, 'note' | 'rule'>>> = {
  COMBAT: { note: 'Exerts a ZOC. Cannot use rail, air or shipping transport.', rule: '5.5' },
  MOVE: { note: 'No ZOC. May use rail, air and shipping transport.', rule: '5.6' },
};

/** The other four modes are markers laid on top of the counter (5.2), so each is a mark in the panel. */
const MARKER_ROWS: Readonly<Record<string, Pick<StatusRow, 'icon' | 'value' | 'tone' | 'note' | 'rule'>>> = {
  RESERVE: { icon: 'RESERVE', value: 'Reserve', tone: 'warn', note: 'Cannot attack, overrun or barrage until released. Moves 1/4 MA; defends at half strength.', rule: '5.7' },
  STRAT: { icon: 'STRAT', value: 'Strat', tone: 'warn', note: 'Moves at double MA, off roads. Combat Strength and Action Rating are 0; cannot attack, overrun or barrage.', rule: '5.8' },
  EXPLOITATION: { icon: 'EXPLOIT', value: 'Exploit', tone: 'ok', note: 'May move (half MA) and fight in the Exploitation Phase. Removed at Clean Up.', rule: '5.9' },
  DG: { icon: 'DG', value: 'Disorganized (DG)', tone: 'bad', note: 'Combat, barrage and movement values halved; Action Rating −1; no overrun or Exploit; no rail, air or shipping. Removed at Clean Up.', rule: '5.10' },
};

/** The rule effect of Combat or Move Mode, for the tooltip on the mode name in the selection card. */
export const modeNote = (mode: string | null): string | undefined => {
  const row = mode === null ? undefined : MODE_ROWS[mode];
  return row ? `${row.note} (${row.rule})` : undefined;
};

const statusValue = (piece: ProjectedPiece, id: string): string | number | undefined =>
  piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === id)?.value;

/**
 * Status panel rows for a ground combat unit. Enemy units show only what 4.9a lets the viewer know
 * (Out of Supply); everything else is hidden for them.
 * Rows are markers: a row is present only when its marker would be on the counter, absent means none.
 *
 * TODO: Reserve "released" and "barraged" are engine usage state the projection does not expose, so they have no row.
 * Impact: a released Reserve unit still reads "Reserve" and a unit that has barraged shows no mark.
 * Close with: a query for per-piece usage (reserveReleased, barraged) and a UI test that releases a Reserve.
 */
export const unitStatusRows = (snapshot: UiSnapshot, piece: ProjectedPiece): readonly StatusRow[] => {
  const definition = pieceDefinition(snapshot.scenario, piece);
  if (!definition || definition.family !== 'GROUND' || piece.mode === null || definition.counter?.kind === 'TRANSPORT') return [];
  const own = piece.ownerId === snapshot.view.playerId;
  const rows: StatusRow[] = [];

  // Combat and Move carry no marker, so no row: the selection card names them, with the rule effect as a tooltip.
  // A marker mode also says which side of the counter is up (5.2, 5.7a).
  const marker = MARKER_ROWS[piece.mode];
  const face = definition.faces.find(({ id }) => id === piece.currentFaceId);
  if (marker) rows.push({ key: 'mode', label: 'Mode', ...marker, value: face?.name ? `${marker.value} · ${face.name} side` : marker.value });

  // Like the board game's markers, a row appears only when its marker would be on the counter; no row means none.
  if (piece.statuses.includes('status:out-of-supply')) {
    rows.push({ key: 'supply', icon: 'OOS', label: 'Out of Supply', value: 'Marked', tone: 'bad', note: 'No ZOC. Attacks and defends at half strength with combat supply, otherwise cannot attack and defends at 1/4. Barrage and movement normal.', rule: '12.8d' });
  }

  if (own) {
    const stocks = statusValue(piece, 'status:internal-stocks');
    if (stocks === 'LOW' || stocks === 'EXHAUSTED') {
      rows.push({
        key: 'stocks', icon: stocks === 'LOW' ? 'LOW STOCK' : 'NO STOCK', label: 'Internal stocks', rule: '12.10',
        value: stocks === 'LOW' ? 'Low' : 'Exhausted', tone: stocks === 'EXHAUSTED' ? 'bad' : 'warn',
        note: 'Replenish in the Supply Phase when a dump is in reach.',
      });
    }
    const since = statusValue(piece, 'status:out-of-trace-since');
    if (typeof since === 'number') rows.push({ key: 'trace', icon: 'NO TRACE', label: 'Out of trace since', value: `Turn ${since}`, tone: 'warn', note: 'May attempt a breakout; otherwise attrition applies.', rule: '12.8e' });

    const fueledBy = ({ SINGLE_UNIT: 'single unit, 1T', FORMATION: 'Formation method', HQ: 'HQ method' } as Record<string, string>)[snapshot.selectedFuel ?? ''];
    if (fueledBy) rows.push({ key: 'fuel', icon: 'FUEL', label: 'Fuel', value: `Fueled · ${fueledBy}`, tone: 'ok', note: 'Truck and Tracked MP can be spent. Single-unit fuel lasts this phase; the others until your next Clean Up Phase.', rule: '12.5c' });
  }

  const id = String(piece.id);
  if (own && snapshot.movedThisPhase.has(id)) rows.push({ key: 'moved', icon: 'MOVED', label: 'Moved', value: 'This phase', tone: 'none' });
  if (own && snapshot.attackedThisPhase.has(id)) rows.push({ key: 'attacked', icon: 'ATTACKED', label: 'Attacked', value: 'This phase', tone: 'warn' });

  return rows;
};
