# M6.6 — Topology and quality validation

Validation composes the Foundation map validator with generator checks:

- exact bounds/Hex count and valid Definition references;
- canonical adjacent Hexside endpoints;
- at least four settlements and one river;
- all strategic nodes on land and on the single road component;
- road coverage (`ROAD_COVERAGE_GAP`): every open Hex within two Hexes of a road, every wooded or hill
  Hex within three (metrics `maximumRoadGap` and `roadGapExcess`);
- a continuous land corridor between opposing entries;
- severe-terrain and style-specific water ratios.

Generation fails closed with issue codes. Seed tests do not suppress or downgrade invalid outputs.
A road density below 0.35 road Hexsides per land Hex is reported as a warning.
