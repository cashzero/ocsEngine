// Record ACT-08, ACT-10, ACT-11, ACT-12 from step 010, with the Ledger read to show the combat supply was paid once.
await tab(h, 'Ledger');
const ledger = (await textOf(h, '.command-rail')).replace(/^.*?Ledger/, '').slice(0, 700);
await h.shot('act11-ledger');
const o = state.overrun;
const decisions = o.steps.filter((s) => s.seat);
const handoffs = o.steps.filter((s) => s.handoff);
record(h, 'ACT-08', 'Movement-segment overrun starts only in a legal state', `Brown TF moved to 1310 (6 MP left); the deck offered no target until it stood beside the enemy; 1410 then announced "attack target"; Enter on 1410 opened the plan in ${o.draftMs} ms: "${o.draft1.slice(0, 230)}"; Cancel left "${o.afterCancel.card}" and no plan; Overrun declared in ${o.declareMs} ms; afterwards 1410 "${o.at1410}"; Log "${o.log.slice(0, 160)}"`,
  /Overrun/.test(o.draft1) && o.afterCancel.card === '6 MP left' && /Brown TF/.test(o.at1410));
record(h, 'ACT-10', 'Decision from the owning seat: the map is hidden while the screen passes, a choice is accepted and the transaction/revision advances', `${decisions.map((d) => `${d.seat}: "${d.prompt.slice(0, 90)}…" options [${d.options.join(' | ')}] → "${d.chosen}" (${d.ms} ms)`).join(' ‖ ')} ‖ hand-overs: ${handoffs.map((s) => `"${s.handoff.slice(0, 80)}" map hidden ${!s.privacy.mapVisible}`).join('; ')}`,
  decisions.some((d) => d.seat === 'Axis commander') && handoffs.length >= 1 && handoffs.every((s) => !s.privacy.mapVisible) && decisions.every((d) => d.ms <= 1500));
// COMMIT/CANCEL_TRANSACTION have no player control: a declared combat runs to its end through decisions.
const blocked = (id, expectation, observed) => { h.rows.push({ id, expectation, observed, status: 'BLOCKED' }); h.log.push(`BLOCKED ${id}: ${expectation} — observed: ${observed}`); };
blocked('ACT-11', 'Execute COMMIT_TRANSACTION: reserved resources resolve once and the final result is visible', `No control issues COMMIT_TRANSACTION (the rule engine rejects it as never legal: src/rules/kernel/reducer.ts); the overrun transaction closed by itself after the last decision. Equivalent outcome observed: each side paid its 1T once and the Ledger reads "${ledger.slice(0, 300)}"`);
blocked('ACT-12', 'Execute CANCEL_TRANSACTION in a cancellable state: reservation released, no result applied', `No control issues CANCEL_TRANSACTION: after Declare, every decision offered only payment choices (${decisions.map((d) => d.options.length).join('/')} options, none cancels). Only the plan before declaring can be cancelled (#cancel-draft, verified: MP and state unchanged), which is not a transaction.`);
return { ledger };
