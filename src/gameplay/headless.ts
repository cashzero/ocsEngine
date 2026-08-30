import type {
  GameSession,
  HeadlessCommand,
  HeadlessCommandSource,
  HeadlessRunResult,
} from './model.js';

export const runHeadlessCommands = async (
  session: GameSession,
  commands: readonly HeadlessCommand[],
): Promise<HeadlessRunResult> => {
  const results = [];
  for (const command of commands) results.push(await session.dispatch(command));
  return {
    results,
    accepted: results.filter(({ status }) => status === 'ACCEPTED').length,
    rejected: results.filter(({ status }) => status !== 'ACCEPTED').length,
    finalRevision: session.getRevision(),
    finalStateHash: session.getMetadata().stateHash,
    stopReason: results.some(({ status }) => status !== 'ACCEPTED') ? 'REJECTED' : 'COMMANDS_EXHAUSTED',
  };
};

export const runHeadlessSession = async (
  session: GameSession,
  source: HeadlessCommandSource,
  maximumCommands: number,
): Promise<HeadlessRunResult> => {
  const results = [];
  const budget = Math.max(0, Math.floor(maximumCommands));
  let stopReason: HeadlessRunResult['stopReason'] = 'BUDGET_EXHAUSTED';
  for (let index = 0; index < budget; index += 1) {
    if (session.getMetadata().lifecycle === 'FINISHED') {
      stopReason = 'FINISHED';
      break;
    }
    const command = source(session, index);
    if (command === null) {
      stopReason = 'NO_COMMAND';
      break;
    }
    const result = await session.dispatch(command);
    results.push(result);
    if (result.status !== 'ACCEPTED') {
      stopReason = 'REJECTED';
      break;
    }
  }
  if (session.getMetadata().lifecycle === 'FINISHED') stopReason = 'FINISHED';
  return {
    results,
    accepted: results.filter(({ status }) => status === 'ACCEPTED').length,
    rejected: results.filter(({ status }) => status !== 'ACCEPTED').length,
    finalRevision: session.getRevision(), finalStateHash: session.getMetadata().stateHash,
    stopReason,
  };
};
