import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.OCS_UI_URL ?? 'http://127.0.0.1:4173/';
const port = Number(process.env.OCS_CDP_PORT ?? 9223);
const artifactDirectory = join(process.cwd(), 'tmp', 'ui-flow-gate');
const cases = [
  {
    id: 'default',
    style: 'WESTERN_EUROPE', width: 18, height: 12,
    scale: 'COMPACT', formations: 2,
    mapSeed: 0x0c50_0001, oobSeed: 0x0c50_0002,
    deploymentSeed: 0x0c50_0003, rulesSeed: 0x0c50_0004,
    turnLimit: 2,
  },
  {
    id: 'large',
    style: 'WESTERN_EUROPE', width: 18, height: 12,
    scale: 'LARGE', formations: 4,
    mapSeed: 91_001, oobSeed: 91_002,
    deploymentSeed: 91_003, rulesSeed: 91_004,
    turnLimit: 3,
  },
  {
    id: 'contact',
    style: 'WESTERN_EUROPE', width: 8, height: 8,
    scale: 'COMPACT', formations: 1,
    mapSeed: 92_001, oobSeed: 92_002,
    deploymentSeed: 92_003, rulesSeed: 92_004,
    turnLimit: 4,
  },
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find(({ url }) => url === baseUrl) ?? targets.find(({ type }) => type === 'page');
if (!target) throw new Error(`No browser page target is available on CDP port ${port}.`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.exception?.description
      ?? message.params.exceptionDetails.text);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    browserErrors.push(message.params.entry.text);
  }
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
};

const waitFor = async (expression, label, timeout = 10_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
};

const clickVisible = async (selector) => evaluate(`(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) throw new Error('Missing control: ${selector}');
  element.scrollIntoView({ block: 'center', inline: 'center' });
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
    throw new Error('Control is not player-visible: ${selector}');
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
})()`);

const capture = async (filename) => {
  const image = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
  });
  await writeFile(join(artifactDirectory, filename), Buffer.from(image.data, 'base64'));
};

const currentState = () => evaluate(`(() => ({
  lifecycle: document.querySelector('.lifecycle span')?.textContent ?? '',
  turn: Number(document.querySelector('.turn-strip span:nth-child(1) strong')?.textContent ?? 0),
  phase: document.querySelector('.turn-strip span:nth-child(2) strong')?.textContent ?? '',
  segment: document.querySelector('.turn-strip span:nth-child(3) strong')?.textContent ?? '',
  revision: Number(document.querySelector('.turn-strip span:nth-child(4) strong')?.textContent ?? 0),
  seat: document.querySelector('.topbar')?.dataset.activeSeat ?? '',
  families: [...document.querySelectorAll('[data-action-kind]')].map((node) => node.dataset.actionKind),
  handoffRequired: document.querySelector('#begin-required-handoff') !== null,
  privacy: document.querySelector('#complete-handoff') !== null,
  decision: document.querySelector('[data-choice]') !== null,
}))()`);

const executeFamily = async (kind, timings, candidateText = null, candidateDirection = null) => {
  const before = await currentState();
  const selectedAt = performance.now();
  await clickVisible(`[data-action-kind="${kind}"]`);
  const selectMilliseconds = performance.now() - selectedAt;
  await waitFor("document.querySelector('[data-candidate]') !== null", `${kind} candidate`, 5_000);
  const candidateIndex = candidateDirection === 'NEAREST_ENEMY' ? await evaluate(`(() => {
    const coordinate = (text) => {
      const match = text?.match(/,[ ]*(-?[0-9]+),(-?[0-9]+),/u);
      return match ? { q: Number(match[1]), r: Number(match[2]) } : null;
    };
    const enemies = [...document.querySelectorAll('.counter[aria-label^="Enemy"]')]
      .map((counter) => coordinate(counter.getAttribute('aria-label'))).filter(Boolean);
    const distance = (left, right) => (Math.abs(left.q - right.q) + Math.abs(left.r - right.r)
      + Math.abs((left.q - right.q) + (left.r - right.r))) / 2;
    const candidates = [...document.querySelectorAll('[data-candidate]')];
    const ranked = candidates.map((candidate, index) => {
      const match = candidate.textContent.match(/→[ ]*(-?[0-9]+),(-?[0-9]+)/u);
      const destination = match ? { q: Number(match[1]), r: Number(match[2]) } : null;
      return { index, score: destination && enemies.length > 0
        ? Math.min(...enemies.map((enemy) => distance(destination, enemy))) : Infinity };
    }).filter(({ score }) => Number.isFinite(score));
    ranked.sort((left, right) => left.score - right.score || left.index - right.index);
    return ranked[0]?.index ?? -1;
  })()`) : candidateDirection !== null ? await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('[data-candidate]')];
    const ranked = candidates.map((candidate, index) => {
      const match = candidate.textContent.match(/→[ ]*(-?[0-9]+),/u);
      return { index, q: match ? Number(match[1]) : ${candidateDirection === 'MAX_Q' ? '-Infinity' : 'Infinity'} };
    }).filter(({ q }) => Number.isFinite(q));
    ranked.sort((left, right) => ${candidateDirection === 'MAX_Q' ? 'right.q - left.q' : 'left.q - right.q'} || left.index - right.index);
    return ranked[0]?.index ?? -1;
  })()`) : candidateText === null ? 0 : await evaluate(`(() => {
    const candidates = [...document.querySelectorAll('[data-candidate]')];
    return candidates.findIndex((candidate) => candidate.textContent.includes(${JSON.stringify(candidateText)}));
  })()`);
  if (candidateIndex < 0) throw new Error(`${kind} has no candidate containing ${candidateText}.`);
  await clickVisible(`[data-candidate="${candidateIndex}"]`);
  const summary = await evaluate("document.querySelector('[data-candidate].is-selected span')?.textContent ?? document.querySelector('[data-candidate] span')?.textContent ?? ''");
  const executable = await evaluate("document.querySelector('#execute-action')?.disabled === false");
  if (!executable) throw new Error(`${kind} has no executable visible candidate.`);
  const executedAt = performance.now();
  await clickVisible('#execute-action');
  await waitFor(`Number(document.querySelector('.turn-strip span:nth-child(4) strong')?.textContent ?? 0) > ${before.revision}`, `${kind} revision`, 8_000);
  const executeMilliseconds = performance.now() - executedAt;
  timings.push({ kind, phase: before.phase, segment: before.segment, selectMilliseconds, executeMilliseconds });
  return { summary, revisionBefore: before.revision, revisionAfter: (await currentState()).revision };
};

const clickFrontmostFriendlyCounter = async (toward) => evaluate(`(() => {
  const visibleFriendly = [...document.querySelectorAll('.counter:not([aria-label^="Enemy"])')];
  const unselected = visibleFriendly.filter((counter) => !counter.classList.contains('is-selected'));
  const counters = unselected.length > 0 ? unselected : visibleFriendly;
  const ranked = counters.map((counter) => {
    const match = counter.getAttribute('aria-label')?.match(/,[ ]*(-?[0-9]+),(-?[0-9]+),/u);
    return { counter, q: match ? Number(match[1]) : ${toward === 'MAX_Q' ? '-Infinity' : 'Infinity'} };
  }).filter(({ q }) => Number.isFinite(q));
  ranked.sort((left, right) => ${toward === 'MAX_Q' ? 'right.q - left.q' : 'left.q - right.q'});
  const target = ranked[0]?.counter;
  if (!target) throw new Error('No visible friendly counter is available for strategic movement.');
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
})()`);

const clickFriendlyCounterNearestEnemy = async () => evaluate(`(() => {
  const coordinate = (text) => {
    const match = text?.match(/,[ ]*(-?[0-9]+),(-?[0-9]+),/u);
    return match ? { q: Number(match[1]), r: Number(match[2]) } : null;
  };
  const friendly = [...document.querySelectorAll('.counter:not([aria-label^="Enemy"])')]
    .filter((counter) => !counter.classList.contains('is-selected'));
  const candidates = friendly.length > 0 ? friendly
    : [...document.querySelectorAll('.counter:not([aria-label^="Enemy"])')];
  const enemies = [...document.querySelectorAll('.counter[aria-label^="Enemy"]')]
    .map((counter) => coordinate(counter.getAttribute('aria-label'))).filter(Boolean);
  const distance = (left, right) => (Math.abs(left.q - right.q) + Math.abs(left.r - right.r)
    + Math.abs((left.q - right.q) + (left.r - right.r))) / 2;
  const ranked = candidates.map((counter) => {
    const origin = coordinate(counter.getAttribute('aria-label'));
    return { counter, score: origin && enemies.length > 0
      ? Math.min(...enemies.map((enemy) => distance(origin, enemy))) : Infinity };
  }).filter(({ score }) => Number.isFinite(score));
  ranked.sort((left, right) => left.score - right.score);
  const target = ranked[0]?.counter;
  if (!target) throw new Error('No friendly/enemy counter pair is visible for contact movement.');
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
})()`);

const selectFriendlyWithMoveCandidates = async (preference, labelIncludes = null) => {
  const pieceIds = await evaluate(`(() => {
    const coordinate = (text) => {
      const match = text?.match(/,[ ]*(-?[0-9]+),(-?[0-9]+),/u);
      return match ? { q: Number(match[1]), r: Number(match[2]) } : null;
    };
    const distance = (left, right) => (Math.abs(left.q - right.q) + Math.abs(left.r - right.r)
      + Math.abs((left.q - right.q) + (left.r - right.r))) / 2;
    const enemies = [...document.querySelectorAll('.counter[aria-label^="Enemy"]')]
      .map((counter) => coordinate(counter.getAttribute('aria-label'))).filter(Boolean);
    return [...document.querySelectorAll('.counter:not([aria-label^="Enemy"])')]
      .filter((counter) => ${JSON.stringify(labelIncludes)} === null
        || counter.getAttribute('aria-label')?.toLowerCase().includes(${JSON.stringify(labelIncludes?.toLowerCase() ?? '')}))
      .map((counter, index) => {
        const origin = coordinate(counter.getAttribute('aria-label'));
        const contact = origin && enemies.length > 0
          ? Math.min(...enemies.map((enemy) => distance(origin, enemy))) : Infinity;
        return { id: counter.dataset.piece, q: origin?.q ?? 0, contact, index };
      })
      .filter(({ id }) => id)
      .sort((left, right) => ${preference === 'NEAREST_ENEMY'
        ? 'left.contact - right.contact || left.index - right.index'
        : preference === 'MAX_Q'
          ? 'right.q - left.q || left.index - right.index'
          : 'left.q - right.q || left.index - right.index'})
      .map(({ id }) => id);
  })()`);
  for (const pieceId of pieceIds) {
    await clickVisible(`.counter[data-piece=${JSON.stringify(pieceId)}]`);
    if (!await evaluate("document.querySelector('[data-action-kind=\"MOVE_PIECE\"]') !== null")) return false;
    await clickVisible('[data-action-kind="MOVE_PIECE"]');
    if (await evaluate("document.querySelector('[data-candidate]') !== null")) return true;
  }
  return false;
};

const setNewGameControls = async (testCase) => evaluate(`(() => {
  const values = ${JSON.stringify({
    '#new-game-style': testCase.style,
    '#new-game-width': String(testCase.width),
    '#new-game-height': String(testCase.height),
    '#new-game-map-seed': String(testCase.mapSeed),
    '#new-game-scale': testCase.scale,
    '#new-game-formations': String(testCase.formations),
    '#new-game-oob-seed': String(testCase.oobSeed),
    '#new-game-deployment-seed': String(testCase.deploymentSeed),
    '#new-game-rules-seed': String(testCase.rulesSeed),
    '#new-game-turn-limit': String(testCase.turnLimit),
  })};
  for (const [selector, value] of Object.entries(values)) {
    const control = document.querySelector(selector);
    if (!control) throw new Error('Missing New Game control: ' + selector);
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
})()`);

const packageSnapshot = () => evaluate(`(() => ({
  title: document.querySelector('.session-block h1')?.textContent ?? '',
  theater: document.querySelector('.map-card')?.getAttribute('aria-label') ?? '',
  summary: Object.fromEntries([...document.querySelectorAll('.session-summary > div')]
    .map((node) => [node.querySelector('dt')?.textContent ?? '', node.querySelector('dd')?.textContent ?? ''])),
  hexes: document.querySelectorAll('.hex-cell').length,
  counters: document.querySelectorAll('.counter').length,
  terrainSignature: [...document.querySelectorAll('.hex-cell')]
    .map((cell) => [...cell.classList].find((name) => name.startsWith('terrain-')) ?? '').join('|'),
}))()`);

const previewSnapshot = () => evaluate(`(() => ({
  metrics: Object.fromEntries([...document.querySelectorAll('.operation-metrics > div')]
    .map((node) => [node.querySelector('dt')?.textContent ?? '', node.querySelector('dd')?.textContent ?? ''])),
  completedStages: [...document.querySelectorAll('.flow-steps .is-complete')].map((node) => node.textContent.trim()),
  activeStages: [...document.querySelectorAll('.flow-steps .is-active')].map((node) => node.textContent.trim()),
  formationsBySide: [...document.querySelectorAll('.preview-force')].map((side) => side.querySelectorAll('li').length),
  hexes: document.querySelectorAll('.operation-map .generated-cell').length,
  terrainSignature: [...document.querySelectorAll('.operation-map .generated-cell')]
    .map((cell) => [...cell.classList].find((name) => name.startsWith('terrain-')) ?? '').join('|'),
  startEnabled: document.querySelector('#start-previewed-game')?.disabled === false,
}))()`);

const fontAndViewportSnapshot = () => evaluate(`(() => {
  const visibleText = [...document.querySelectorAll('body *')].filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
  return {
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    minimumFontSize: Math.min(...visibleText.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))),
  };
})()`);

const runCase = async (testCase) => {
  await send('Page.navigate', { url: baseUrl });
  await waitFor("document.querySelector('#open-menu') !== null", `${testCase.id} boot`);
  await clickVisible('#open-menu');
  await clickVisible('#open-new-game');
  await waitFor("document.querySelector('#new-game-form') !== null", `${testCase.id} New Game`);
  await setNewGameControls(testCase);

  const previewStarted = performance.now();
  await clickVisible('#new-game-form button[type="submit"]');
  await waitFor("document.querySelector('#start-previewed-game')?.disabled === false", `${testCase.id} preview`);
  const previewMilliseconds = performance.now() - previewStarted;
  const preview = await previewSnapshot();
  await capture(`${testCase.id}-preview.png`);

  const mountStarted = performance.now();
  await clickVisible('#start-previewed-game');
  await waitFor(`document.querySelectorAll('.hex-cell').length === ${testCase.width * testCase.height}`, `${testCase.id} mounted game`);
  const mountMilliseconds = performance.now() - mountStarted;
  const mounted = await packageSnapshot();
  await capture(`${testCase.id}-mounted.png`);

  const playthrough = {
    visited: [], timings: [], handoffs: 0, decisions: 0,
    operations: [], familiesByPhase: {}, issues: [],
  };
  const performed = new Set();
  const strategicMoveTurns = new Set();
  const artilleryMoveTurns = new Set();
  let handoffCaptured = false;
  const targetTurn = testCase.id === 'contact' ? 4 : 2;
  for (let step = 0; step < 240; step += 1) {
    const state = await currentState();
    const visit = `${state.turn}:${state.phase}:${state.segment}:${state.seat}`;
    if (playthrough.visited.at(-1) !== visit) playthrough.visited.push(visit);
    if (state.turn >= targetTurn || state.lifecycle === 'FINISHED') break;
    if (state.privacy) {
      if (!handoffCaptured) {
        await capture(`${testCase.id}-handoff-privacy.png`);
        handoffCaptured = true;
      }
      const priorSeat = state.seat;
      await clickVisible('#complete-handoff');
      await waitFor(`document.querySelector('#complete-handoff') === null
        && document.querySelector('.topbar')?.dataset.activeSeat !== ${JSON.stringify(priorSeat)}`, 'handoff completion');
      playthrough.handoffs += 1;
      continue;
    }
    if (state.handoffRequired) {
      await clickVisible('#begin-required-handoff');
      await waitFor("document.querySelector('#complete-handoff') !== null", 'privacy handoff screen');
      continue;
    }
    if (state.decision) {
      const revisionBeforeDecision = state.revision;
      await clickVisible('[data-choice]');
      await waitFor(`Number(document.querySelector('.turn-strip span:nth-child(4) strong')?.textContent ?? 0) > ${revisionBeforeDecision}`, 'decision revision');
      playthrough.decisions += 1;
      continue;
    }
    const phaseKey = `${state.phase}/${state.segment}`;
    playthrough.familiesByPhase[phaseKey] = [...new Set([
      ...(playthrough.familiesByPhase[phaseKey] ?? []), ...state.families,
    ])];

    const contactCombatKey = `DECLARE_COMBAT:${state.phase}`;
    if (testCase.id === 'contact' && state.families.includes('DECLARE_COMBAT') && !performed.has(contactCombatKey)) {
      playthrough.operations.push({ kind: contactCombatKey, ...(await executeFamily('DECLARE_COMBAT', playthrough.timings)) });
      performed.add(contactCombatKey);
      continue;
    }

    if (state.phase === 'MOVEMENT' && state.segment === 'MOVEMENT' && !performed.has('CHANGE_MODE')) {
      await clickVisible('.counter:not([aria-label^="Enemy"])');
      if ((await currentState()).families.includes('CHANGE_MODE')) {
        playthrough.operations.push({ kind: 'CHANGE_MODE', ...(await executeFamily('CHANGE_MODE', playthrough.timings, 'RESERVE')) });
        performed.add('CHANGE_MODE');
        continue;
      }
      playthrough.issues.push('CHANGE_MODE unavailable after selecting a friendly counter.');
      performed.add('CHANGE_MODE');
    }
    const movementKey = `${state.turn}:${state.seat}`;
    const shouldMove = state.phase === 'MOVEMENT' && state.segment === 'MOVEMENT'
      && (!performed.has('MOVE_PIECE') || (testCase.id === 'contact' && !strategicMoveTurns.has(movementKey)));
    if (shouldMove) {
      const direction = testCase.id === 'contact'
        ? 'NEAREST_ENEMY'
        : state.seat.includes('Allied') ? 'MAX_Q' : 'MIN_Q';
      const movable = await selectFriendlyWithMoveCandidates(direction);
      if (movable) {
        playthrough.operations.push({ kind: 'MOVE_PIECE', ...(await executeFamily('MOVE_PIECE', playthrough.timings, null, direction)) });
        performed.add('MOVE_PIECE');
        strategicMoveTurns.add(movementKey);
        continue;
      }
      playthrough.issues.push('MOVE_PIECE unavailable after selecting a friendly counter.');
      performed.add('MOVE_PIECE');
      strategicMoveTurns.add(movementKey);
    }
    if (testCase.id === 'contact' && state.phase === 'MOVEMENT' && state.segment === 'MOVEMENT'
      && state.families.includes('MOVE_PIECE')
      && !artilleryMoveTurns.has(movementKey)) {
      const artilleryCanMove = await selectFriendlyWithMoveCandidates('NEAREST_ENEMY', 'artillery');
      artilleryMoveTurns.add(movementKey);
      if (artilleryCanMove) {
        playthrough.operations.push({ kind: 'MOVE_ARTILLERY', ...(await executeFamily('MOVE_PIECE', playthrough.timings, null, 'NEAREST_ENEMY')) });
        continue;
      }
    }
    if (state.phase === 'REINFORCEMENT' && state.families.includes('PLACE_REINFORCEMENT') && !performed.has('PLACE_REINFORCEMENT')) {
      playthrough.operations.push({ kind: 'PLACE_REINFORCEMENT', ...(await executeFamily('PLACE_REINFORCEMENT', playthrough.timings)) });
      performed.add('PLACE_REINFORCEMENT');
      continue;
    }
    if (state.phase === 'REACTION' && state.segment === 'MOVEMENT' && state.families.includes('RELEASE_RESERVE') && !performed.has('RELEASE_RESERVE')) {
      playthrough.operations.push({ kind: 'RELEASE_RESERVE', ...(await executeFamily('RELEASE_RESERVE', playthrough.timings)) });
      performed.add('RELEASE_RESERVE');
      continue;
    }
    if (state.phase === 'SUPPLY' && state.families.includes('CHECK_SUPPLY') && !performed.has('CHECK_SUPPLY')) {
      playthrough.operations.push({ kind: 'CHECK_SUPPLY', ...(await executeFamily('CHECK_SUPPLY', playthrough.timings)) });
      performed.add('CHECK_SUPPLY');
      continue;
    }
    if (state.families.includes('DECLARE_BARRAGE') && !performed.has('DECLARE_BARRAGE')) {
      playthrough.operations.push({ kind: 'DECLARE_BARRAGE', ...(await executeFamily('DECLARE_BARRAGE', playthrough.timings)) });
      performed.add('DECLARE_BARRAGE');
      continue;
    }
    if (state.families.includes('DECLARE_COMBAT') && !performed.has(`DECLARE_COMBAT:${state.phase}`)) {
      playthrough.operations.push({ kind: `DECLARE_COMBAT:${state.phase}`, ...(await executeFamily('DECLARE_COMBAT', playthrough.timings)) });
      performed.add(`DECLARE_COMBAT:${state.phase}`);
      continue;
    }
    if (state.families.includes('CANCEL_TRANSACTION') && !performed.has('CANCEL_TRANSACTION')) {
      playthrough.operations.push({ kind: 'CANCEL_TRANSACTION', ...(await executeFamily('CANCEL_TRANSACTION', playthrough.timings)) });
      performed.add('CANCEL_TRANSACTION');
      continue;
    }
    if (state.families.includes('COMMIT_TRANSACTION')) {
      playthrough.operations.push({ kind: 'COMMIT_TRANSACTION', ...(await executeFamily('COMMIT_TRANSACTION', playthrough.timings)) });
      performed.add('COMMIT_TRANSACTION');
      continue;
    }
    if (!state.families.includes('ADVANCE_SEQUENCE')) {
      playthrough.issues.push(`No visible action or handoff at ${visit}.`);
      break;
    }
    await executeFamily('ADVANCE_SEQUENCE', playthrough.timings);
  }

  const finalState = await currentState();
  await capture(`${testCase.id}-turn-complete.png`);
  const desktop = await fontAndViewportSnapshot();
  const maximumSelectionMilliseconds = Math.max(0, ...playthrough.timings.map(({ selectMilliseconds }) => selectMilliseconds));
  const maximumExecutionMilliseconds = Math.max(0, ...playthrough.timings.map(({ executeMilliseconds }) => executeMilliseconds));
  if (preview.completedStages.length !== 4 || preview.activeStages.length !== 0) {
    playthrough.issues.push(`Generation stage state is not truthful: ${JSON.stringify({ completed: preview.completedStages, active: preview.activeStages })}.`);
  }
  if (preview.terrainSignature !== mounted.terrainSignature) playthrough.issues.push('Preview and mounted terrain signatures differ.');
  if (finalState.lifecycle !== 'FINISHED' && finalState.turn < targetTurn) {
    playthrough.issues.push(`Required play boundary was not reached (Turn ${targetTurn} or FINISHED): ${JSON.stringify(finalState)}.`);
  }
  for (const required of ['CHANGE_MODE', 'RELEASE_RESERVE', 'MOVE_PIECE', 'PLACE_REINFORCEMENT', 'CHECK_SUPPLY']) {
    if (!performed.has(required)) playthrough.issues.push(`${required} was not operated during the complete turn.`);
  }
  if (testCase.id === 'contact') {
    for (const required of ['DECLARE_COMBAT:MOVEMENT', 'DECLARE_COMBAT:COMBAT', 'CANCEL_TRANSACTION', 'COMMIT_TRANSACTION', 'DECLARE_BARRAGE']) {
      if (!performed.has(required)) playthrough.issues.push(`${required} was not operated in the contact case.`);
    }
    if (playthrough.decisions === 0) playthrough.issues.push('No pending decision was operated in the contact case.');
  }
  if (previewMilliseconds > 3_000) playthrough.issues.push(`Preview exceeded 3000 ms: ${previewMilliseconds.toFixed(1)} ms.`);
  if (mountMilliseconds > 3_000) playthrough.issues.push(`Mount exceeded 3000 ms: ${mountMilliseconds.toFixed(1)} ms.`);
  if (maximumSelectionMilliseconds > 1_000) playthrough.issues.push(`Selection exceeded 1000 ms: ${maximumSelectionMilliseconds.toFixed(1)} ms.`);
  if (maximumExecutionMilliseconds > 1_500) playthrough.issues.push(`Execution exceeded 1500 ms: ${maximumExecutionMilliseconds.toFixed(1)} ms.`);
  if (desktop.minimumFontSize < 13) playthrough.issues.push(`Desktop font floor is ${desktop.minimumFontSize}px.`);
  return {
    case: testCase, previewMilliseconds, mountMilliseconds, preview, mounted,
    playthrough, finalState, desktop, maximumSelectionMilliseconds, maximumExecutionMilliseconds,
  };
};

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await mkdir(artifactDirectory, { recursive: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
});

const results = [];
for (const testCase of cases) results.push(await runCase(testCase));
await send('Emulation.clearDeviceMetricsOverride');
const report = {
  generatedAt: new Date().toISOString(),
  results,
  browserErrors,
  passed: browserErrors.length === 0 && results.every(({ playthrough }) => playthrough.issues.length === 0),
};
await writeFile(join(artifactDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
socket.close();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
