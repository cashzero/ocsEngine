import type { UiController } from '../../src/index.js';

/**
 * Plays the hot-seat game on through the UI until `phase` of Game Turn `gameTurn` opens: it hands over the
 * screen, answers each decision with its first option, places arrivals, and otherwise ends the step. Nothing
 * arrives on Game Turn 1 (13.6), so tests of the Reinforcement Phase start from Game Turn 2. With `phasingPlayerId`,
 * it stops only in that player's own phase.
 */
export const playUntil = async (
  controller: UiController, gameTurn: number, phase: string, phasingPlayerId: string | null = null, maxSteps = 400,
): Promise<void> => {
  for (let step = 0; step < maxSteps; step += 1) {
    const snapshot = controller.getSnapshot();
    const sequence = snapshot.view.projection?.sequence;
    if (snapshot.handoff || snapshot.handoffPending || !sequence) {
      controller.beginHandoff();
      controller.completeHandoff();
      continue;
    }
    if (sequence.gameTurn === gameTurn && sequence.phase === phase
      && (phasingPlayerId === null || sequence.phasingPlayerId === phasingPlayerId)) return;
    if (snapshot.decision) {
      await controller.respondToDecision(snapshot.decision.options[0]!.id);
    } else if (sequence.phase === 'REINFORCEMENT' && snapshot.arrivals.length > 0) {
      const arrival = snapshot.arrivals[0]!;
      controller.selectPiece(arrival.pieceId);
      await controller.clickHex(arrival.entryHexIds[0]!);
    } else {
      await controller.endStep();
    }
  }
  throw new Error(`Play did not reach the ${phase} Phase of Game Turn ${gameTurn}: ${controller.getSnapshot().notice}`);
};
