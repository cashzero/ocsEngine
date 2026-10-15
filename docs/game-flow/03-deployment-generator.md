# M8.3 Deterministic deployment generator

Deployment turns M7 force identities into Foundation runtime state.

1. Remove water from candidate Hexes and divide land by distance to the opposing entry anchors.
2. Rank each side's zone by distance plus deployment-seed jitter.
3. Keep one independent support unit per side in a named off-map reinforcement box so the generated
   Gameplay flow exposes a real Reinforcement placement operation.
4. Plan the troops first (user request 2026-10-09: "先平均配置HQ 到各個大方向 (根據道路鐵路) 後 平均配置 獨立部隊 (不是全擠在一起)
   跟步兵師裝甲師 然後再 配置supply dump"):
   - The front (the part of the start-line band in trace supply) is split along its width into one sector per HQ. Each
     sector's main axis is the strongest road or railroad Hex crossing the start line in the middle half of the sector
     (rail, then primary road, then road junctions); its HQ stands on that axis just behind the line, in trace supply,
     at least four Hexes from the other HQs where the front is that wide.
   - The divisions are shared out between the sectors, armored and mobile divisions first so no sector gets two while
     another has none, then by unit count. Each division's centre stands on the start line, spread across its sector's
     width, at least three Hexes from the other centres; its units share the centre or stand around it, at most two
     per Hex.
   - The independent units (not HQs or trucks) are shared out one by one, each role spread over the sectors before a
     sector gets a second, and stand across their sector's width a row behind the divisions (artillery two rows), one to
     a Hex where the map allows. They no longer form one group. Engineers are not line units (user, 2026-10-10): they
     are placed with the supply in step 5.
   - A unit that starts in Move Mode with Truck MA stands on the road net where it can (user, 2026-10-09): independent
     units, division members (they take their group's road Hexes first) and HQs. A front unit in Combat Mode holds its
     ground wherever it is.
   - Units stand inside a trace source's draw range where the map allows (a Hex merely adjacent to it is the fallback),
     counting only rail stations behind the side's start line, which it controls at the start.
   - Line units (not engineers) within two Hexes behind the start line start in Combat Mode (user request 2026-10-09), so the front has
     a ZOC on the first turn (4.5); in an attack the defender's whole line does. Where such a ZOC would cut the other
     side's trace supply at the start (4.5a B), the enemy unit whose ZOC cuts the most starts in Move Mode instead.
5. Then place the supply, once both armies stand (user report 2026-10-09: the enemy's dumps could be taken on the
   opening move). Each dump goes to a sector by its unit count and stands behind the line, where its draw range fuels
   the most units no earlier dump reaches (an unfuelled HQ of its sector first), on the road net (a road or railroad Hex;
   user report 2026-10-09: dumps and trucks stood off the road), and outside the Hexes any enemy combat
   unit could enter in its first Movement Segment. Tracked and Leg movement ignores ZOC (4.5a), so on the generated maps
   that is almost always a Hex the side's own units hold: the dump stands with them. Only if no such Hex exists does a
   dump stand within reach, and the deployment then warns; a dump leaves the road net only where no safe road Hex is
   left. Trucks stand on a road or railroad Hex within 3 Hexes of their dump, out of that reach where the map allows;
   next to the dump, or on it when no other safe road Hex is near. A Truck or Track independent unit that no dump can
   fuel moves to the nearest Hex one can (a road Hex first for Truck MA). Engineers (a Pontoon unit defends only, 3.2b;
   its work is construction, 13.8d) start in Move Mode within 4 Hexes of their sector's HQ, out of that reach, more
   than two Hexes behind the start line, on the road and in a dump's draw range where the map allows.
   Air Bases go last: in the rear, on the road net, clear of the dumps, HQs and troops, and out of that reach.
6. Initialize owner, face, full steps, mode (step 4), resource quantity, stack order, and formation membership.
7. Set initial control from the front line (13.3h; user request 2026-10-05: "也要有中立格 因為預設產生的劇本中間是沒有
   控制的"). A Hex's depth for a side is its distance to the nearest of that side's entry/supply Hexes, i.e. from its own
   map edge; the side's front is the depth of its most forward deployed piece. Each side controls its entry/supply
   Hexes, everything behind its own start line (its rear area, 2026-10-09), and every land Hex of its zone no deeper
   than its front: railroads, objectives and open country alike. The
   ground between the two fronts starts neutral, railroads included, so a rail station there is not detrainable
   (13.3c) until a combat unit enters it. On the default 32×24 map each side controls about a fifth of the land.
8. Choose objectives in settlement Hexes (Major City cores, towns, and villages with transport value).
   VP equals settlement value plus port capacity and railroad value, including junction and multi-track bonuses.
   User amendment 2026-10-14: every eligible port carries VP, including the attacker's own ports. Rail junctions and Major
   Cities carry VP in both zones of a meeting engagement, or the defender's zone of an attack. The land-area quota (at least 2 VP per side) is a minimum, not a cap. An oversized candidate is added
   whole, never skipped to fit a cheaper town into the quota. Priority is junction, port, city, other settlement;
   if either side lacks inland entry, ports become rank 0 and junctions rank 1. Within a rank, higher VP comes first,
   then road degree, distance to the front and settlement order. Entry/source ports remain eligible.

   Only Meeting Engagement balances starting objective VP. In Attack, the defender stakes the land-area
   quota for the whole map (as a minimum), attacker ports keep their base VP, and no side receives balancing VP. All objectives have
   their own side’s garrison. In Meeting Engagement, fill the lower side from its remaining
   candidates in priority order, allowing overshoot and then filling the other side. If the lower side has exhausted
   its candidates, add the exact shortfall to its highest-priority objective (its printed VP then exceeds its base
   transport value). A side with no eligible objective still produces an imbalance warning rather than silently
   removing the other side's high-value objectives. Defender garrisons retain their hedgehogs; attacker garrisons have none.
   Attack victory requires the attacker's starting VP plus half the defender's starting VP, rounded up, so the attacker’s
   own ports do not count as progress toward capturing half the defender’s VP.

   Garrison supply (`src/game-flow/garrison-supply.ts`): after composition every garrison's trace supply is checked with
   the actual rules (rail control, HQs, enemy ZOC). A key-point garrison out of trace moves to a spaced, supply-connected
   friendly node within stacking limits, or is omitted with a warning. An objective garrison out of trace keeps an
   emergency stock of 1T (one feeding payment, 12.6c); garrisons in trace get none. The stock is taken from the side's
   existing on-map dumps, so total SP does not grow; off-map aircraft cargo and future arrivals are untouched.

   Historical limitation (superseded by the allocation above): small Eastern Europe maps could lack enough base
   town VP for equality. Automated regression covers 16×12 seeds 1, 0x0c500001 and 777. TODO (small-map visual acceptance):
   preview and start those three maps in the browser to confirm equal visible VP and no imbalance warning. User-visible
   impact if wrong: preview or mounted scores may differ despite the generated package's equal allocation. Closing
   evidence: screenshots and actual starting scores for all three seeds; unit tests alone do not close this check.

   TODO (2026-10-09, steps 4-5): the sector plan, the supply placed after the troops and the Combat Mode front are
   checked only by automated tests and seed scans (`tests/game-flow/deployment-plan.test.ts`; 100 seeds per engagement
   with every unit in trace, 50 with every enemy dump out of first-move reach and every Truck/Track unit fuelable). They
   have not been seen in the browser: Chromium could not start in the environment that made them. User-visible impact
   if they are wrong: a lopsided front, dumps standing where they read oddly, or a first move that still reaches supply.
   Accepted when, in the browser, a default MEETING and a default ALLIED_ATTACKS game each show the HQs spread across
   the front, the independent units spread rather than grouped, each dump under its own troops, the front units on
   their Combat faces, and an Allied first Movement Segment in which no Axis dump lies in any unit's highlighted range.

The deployment seed changes location choice only. Insufficient land or strategic regions fails at `DEPLOYMENT`; it never silently drops a unit.

Implementation: `src/game-flow/deployment.ts`.
