# OCS implementation study

執行層的中文總覽請見 [ocsEngine 實作 Roadmap](../roadmap.md)。本目錄保留
Roadmap 所依據的逐步研究證據。

核心三層另有詳細工作分解：

- [Foundation WBS](../roadmap/01-foundation-wbs.md)
- [Rule Engine WBS](../roadmap/02-rule-engine-wbs.md)
- [Gameplay Engine WBS](../roadmap/03-gameplay-engine-wbs.md)

This directory records the evidence used to plan `ocsEngine`. The study is
deliberately split into reviewable steps: each step produces its own document
before any implementation roadmap is accepted.

## Authoritative inputs

- OCS: `docs/rules/ocs-series-rules-v4.3.md`, an unofficial transcription of
  *Operational Combat Series Rules v4.3* (2018). The published PDF remains the
  authority if the transcription differs.
- BCS: `E:/work/bcsEngine/docs/rule.txt`, the BCS v2.0 rules reference used by
  the existing `bcsEngine` repository.
- Reuse study: the checked-in source and tests under `E:/work/bcsEngine`.
- Game reference: the unpacked `E:/work/Beyond the Rhine_1_27_0` VASSAL
  module, used read-only to inventory game data and predefined setups.

The VASSAL module is evidence about a particular implementation and its setup
data, not an authoritative rulebook. Game-specific rules and licensed source
material remain explicit dependencies. Copyrighted maps, counters, charts, and
other module assets must not be copied into this repository without permission.

## Deliverables and order

| Step | Output | Question answered |
|---|---|---|
| 0 | This file | What will be studied, in what order, and to what standard? |
| 1 | `01-foundations-and-sequence.md` | How do scale, components, core concepts, and turn structure differ? |
| 2 | `02-units-modes-zoc-movement.md` | How do unit state, stacking, modes, ZOC, and movement differ? |
| 3 | `03-combat-barrage-exploitation.md` | How do overrun, combat, barrage, retreat, advance, and exploitation differ? |
| 4 | `04-supply-logistics-special-units.md` | How do supply, transport, HQ, special units, and reinforcements differ? |
| 5 | `05-air-weather-naval-optional.md` | What new air, weather, naval, port, and optional-rule systems does OCS require? |
| 6 | `06-bcsengine-reuse-study.md` | Which `bcsEngine` modules can be reused, adapted, referenced, or rejected? |
| 7 | `07-beyond-the-rhine-vassal-reference.md` | What reliable data and validation evidence can the reference VASSAL module provide? |
| 8 | `08-crosswalk-and-implementation-roadmap.md` | Which OCS rule subsystems and dependencies must the generator roadmap eventually cover? |
| 9 | `09-rules-vs-plan-gap-analysis.md` | Where do the Rule Engine plan, slice specs, manifest, and implementation diverge from OCS 4.3? |

## Required structure for every study document

Every step document must contain:

1. exact source scope (rule sections and/or code paths);
2. a concise OCS-versus-BCS comparison;
3. consequences for domain state, actions, rules, UI, and tests;
4. a classification of reuse (`direct`, `adapt`, `reference`, or `none`);
5. unresolved questions and external dependencies;
6. an explicit completion checklist.

The final roadmap may only rely on conclusions recorded in these step
documents. A feature is not considered understood merely because a similarly
named BCS feature exists.

## Comparison vocabulary

- **Same concept**: the rule meaning and lifecycle are close enough to share a
  domain abstraction after tests prove equivalence.
- **Related concept**: the name or UI resembles BCS, but OCS semantics require a
  separate domain model or rule strategy.
- **OCS-only**: no meaningful BCS engine equivalent exists.
- **BCS-only**: must not leak into OCS state or UI.
- **Game-specific**: series rules defer required values or exceptions to a
  particular title/scenario.

## Completion gate

The study is complete only when:

- OCS sections 1.0 through 21.12 have an entry in the final crosswalk;
- each BCS subsystem considered for reuse has evidence from source and tests;
- deferred scope is named explicitly;
- every roadmap milestone has rule references, prerequisites, and acceptance
  tests;
- the VASSAL reference is separated into usable facts, codec-dependent data,
  and prohibited/unverified inputs;
- no production implementation has started from an unreviewed assumption.
