# Ground barrage candidate in Gameplay sessions

Base commit `c58d748`, with the ground barrage candidate in the working tree. The candidate used `barrageGroupsByCost: 1`; the comparison used v91's defaults. The recorded input is [Western attack seed 1300205 at revision 214](../../../../tests/ai/fixtures/barrage-cost-1300205.state.json.gz), just before Axis's second-turn Combat Barrage Segment. The isolated hard-target input increases the defending unit definitions' printed strength sixfold and removes other on-map enemy combat units. Its variants apply DG to the target or place all adjacent attackers in Reserve.

Run `npx vitest run tests/ai/barrage-groups.test.ts`. The test uses the game session's draft validation and dispatch, the seat's normal bot policy, payment decisions and the rules reducer.

| Expected | Observed |
|---|---|
| Offer distinct legal prices on the recorded target at 12,12 | 1 gun for 3T, 2 for 4T, 4 for 6T, 6 for 8T. The v91 decision uses 8 guns for 8T. |
| Skip the salvo when the recorded attack already has a high chance to hit | The candidate ends Barrage without spending SP, then the session accepts its attack declaration on 11,15 in the Combat Segment. |
| Select the 4T group for a hard target with a viable follow-up after payment | The paid DG preview moves the regular attack from 1:2 to 1:1. The session accepts the two-gun barrage and the bot's pending decisions, records exactly 4T consumed and settles the barrage. Save/load and replay match the state hash. |
| Hold fire on the already DG stack and the target with no capable adjacent attackers | The candidate ends the Barrage Segment in both variants. |

In four reads of the recorded position with fresh bot action access each time, the baseline decision took 23/5/5/5 ms and the candidate took 232/8/13/14 ms on Node 26.9.0. This measures one position and includes cache warm-up. No browser operated and no whole-match VP was measured. The work leaves the product-verification rows open at their recorded status.
