# Artillery facility restrictions through the mounted game

- PASS ACT-18: movement prevents the player from starting an artillery attack on 0503 — observed: {"state":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]},"highlighted":false,"offered":false,"draft":false,"panel":"Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Hex 0503 No unit of yours here. Deselect Unit Logistics Air Log All units (24) Select a unit on the map, or open All units, to see its actions. 19 units have not moved yet. Save loaded at revision 0."}
- screenshot 01-movement.jpg
- PASS ACT-18: out-of-range prevents the player from starting an artillery attack on 0503 — observed: {"state":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Combat · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]},"highlighted":false,"offered":false,"draft":false,"panel":"No barrage targets in range. Hex 0503 No unit of yours here. Deselect Targets Unit Log All units (24) No barrage targets in range. Save loaded at revision 0."}
- screenshot 02-out-of-range.jpg
- PASS ACT-18: no-supply prevents the player from starting an artillery attack on 0503 — observed: {"state":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Combat · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]},"highlighted":false,"offered":false,"draft":false,"panel":"No barrage targets in range. Hex 0503 No unit of yours here. Deselect Targets Unit Log All units (24) No barrage targets in range. Save loaded at revision 0."}
- screenshot 03-no-supply.jpg
- PASS ACT-18: hex-used prevents the player from starting an artillery attack on 0503 — observed: {"state":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Combat · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]},"highlighted":false,"offered":false,"draft":false,"panel":"No barrage targets in range. Hex 0503 No unit of yours here. Deselect Targets Unit Log All units (24) No barrage targets in range. Save loaded at revision 0."}
- screenshot 04-hex-used.jpg
- PASS ACT-18: unit-used prevents the player from starting an artillery attack on 0503 — observed: {"state":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Combat · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]},"highlighted":false,"offered":false,"draft":false,"panel":"No barrage targets in range. Hex 0503 No unit of yours here. Deselect Targets Unit Log All units (24) No barrage targets in range. Save loaded at revision 0."}
- screenshot 05-unit-used.jpg
- PASS ACT-18: No browser errors while the UI enforces restrictions — observed: []

Ended at: Turn 1 / 3, Allied player turn, Combat · Barrage

Console/page errors: 0

