# M6.6 — Topology and quality validation

Validation composes the Foundation map validator with generator checks:

- exact bounds/Hex count and valid Definition references;
- canonical adjacent Hexside endpoints;
- at least four settlements and one river;
- all strategic nodes on land and on the single road component;
- a continuous land corridor between opposing entries;
- severe-terrain and style-specific water ratios.

Generation fails closed with issue codes. Seed tests do not suppress or downgrade invalid outputs.

