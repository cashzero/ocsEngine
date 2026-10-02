import { render } from 'lit-html';
import {
  commandDeckView, movePopupView, phaseControlsView, unitRosterView, type DeckState,
} from '../../src/ui/command-deck.js';
import type { UiSnapshot } from '../../src/ui/model.js';

/**
 * Renders a lit-html view into a detached element and returns its markup without lit's comment markers.
 * Test files that use it run in the happy-dom environment (lit-html needs a document to render).
 */
export const toHtml = (view: unknown): string => {
  const host = document.createElement('div');
  render(view, host);
  return host.innerHTML.replace(/<!--[\s\S]*?-->/gu, '');
};

export const commandDeckHtml = (snapshot: UiSnapshot, state: DeckState): string => toHtml(commandDeckView(snapshot, state));
export const movePopupHtml = (snapshot: UiSnapshot, state?: DeckState): string => toHtml(movePopupView(snapshot, state));
export const phaseControlsHtml = (snapshot: UiSnapshot, state: DeckState): string => toHtml(phaseControlsView(snapshot, state));
export const unitRosterHtml = (snapshot: UiSnapshot, state: DeckState): string => toHtml(unitRosterView(snapshot, state));
