# U7 — History, save/load, and checkpoints

## Study result

The timeline reads bounded Gameplay history and shows revision, action kind, and engine-produced summary. It does not reconstruct history from DOM events.

Download writes the canonical Gameplay save as JSON. Load passes file text to `GameplayEngine.loadSession` and accepts only the currently mounted scenario, then replaces the session subscription atomically. Checkpoints use public descriptors; restore calls `undoTo`, after which the session is PAUSED and must be explicitly resumed.
