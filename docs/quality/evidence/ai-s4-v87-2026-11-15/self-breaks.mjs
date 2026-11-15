// Moves where the moving combat unit itself leaves trace: is it fed there (a dump reaches it with SP, 12.6c), and whose
// move is it (candidate or baseline seat)?  node self-breaks.mjs <root> <dir>...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const counts = {};
const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const f of readdirSync(dir).filter((x) => /^match-\d+\.save\.json$/u.test(x))) {
    const match = Number(f.match(/\d+/u)[0]);
    const rec = records.find((r) => r.match === match);
    const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    let pending = [];
    for (const action of save.acceptedActions) {
      const next = m.ruleEngine.applyAction(state, action).state;
      if (action.kind === 'MOVE_PIECE') {
        const before = state.pieceState.pieces.find((p) => p.id === action.pieceId);
        const after = next.pieceState.pieces.find((p) => p.id === action.pieceId);
        if (before && after && m.isOnMapCombatUnit(state, before) && m.pieceHasTrace(state, before) && !m.pieceHasTrace(next, after)) {
          const side = String(action.actorId).endsWith('axis') ? 'axis' : 'allied';
          const policy = rec.sides[side].policy;
          const fed = (m.ruleEngine.queryFeedCoverage(next, action.actorId, action.pieceId).value ?? []).some((feed) => feed.tokens > 0 && feed.hexIds.map(String).includes(String(after.location.hexId)));
          bump(`${dir.split('/').slice(-1)[0]} ${policy.includes('frozen-v86') ? 'v86' : 'candidate'} ${fed ? 'fed' : 'UNFED'}`);
          if (!fed) pending.push({ id: action.pieceId, actorId: action.actorId, who: policy.includes('frozen-v86') ? 'v86' : 'candidate', dir: dir.split('/').slice(-1)[0], match, turn: state.sequence.gameTurn });
        }
      }
      if (pending.length && !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT')) {
        for (const u of pending) {
          const piece = next.pieceState.pieces.find((p) => p.id === u.id);
          const ok = piece && piece.location.kind === 'ON_MAP' && (m.pieceHasTrace(next, piece)
            || (m.ruleEngine.queryFeedCoverage(next, u.actorId, u.id).value ?? []).some((feed) => feed.tokens > 0 && feed.hexIds.map(String).includes(String(piece.location.hexId))));
          bump(`${u.dir} ${u.who} unfed at move: ${ok ? 'supplied by segment end' : 'STILL UNSUPPLIED at segment end'}`);
          if (!ok) console.log('unsupplied', u.dir, u.match, 'GT', u.turn, u.who, String(u.id).split(':').slice(-2).join(':'));
        }
        pending = [];
      }
      state = next;
    }
  }
}
console.log(counts);
