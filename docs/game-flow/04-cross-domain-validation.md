# M8.4 Cross-domain validation

Foundation validates each map, catalog and runtime record. M8 adds the checks that exist only after Map and OOB are connected:

- no unit begins on water;
- opposing sides do not share an initial Hex;
- initial stacks do not exceed the Rule Configuration's 40 quarter-RE ticks;
- every player has an entry, supply source and maneuver unit;
- the complete Scenario and production Rule Configuration are valid.

Failures preserve their stage and structured path and are returned before `GameplayEngine.createSession`. Rule legality is not weakened to accommodate generator output.

Implementation: `src/game-flow/validation.ts`.

