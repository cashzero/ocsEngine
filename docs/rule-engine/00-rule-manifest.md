# R0 Rule Manifest

The executable manifest is `src/rules/manifest.ts`. Every Rule Engine capability is classified as `IMPLEMENTED`, `PARTIAL` (usable, with every known gap listed after `GAP:` in its note), `DEFERRED`, `GAME_SPECIFIC`, or `NOT_APPLICABLE`, with owning module, OCS rule citation, public actions/queries, tests, and a scope note.

Implemented or partial capabilities cover the turn sequence and weather, mode, stacking, purpose-specific ZOC, ground movement, trace/dump supply with Extenders, attrition and breakout, fuel, trucks, rail supply and Rail Cap, ports and Sea Cap, regular combat, overrun, artillery barrage, retreat/advance, Breakdowns, hedgehogs, engineer bridging, replacements and rebuilds, air power (bases, missions, transport and drops), reinforcement, cleanup, and a generic victory adapter. Each `PARTIAL` entry lists its gaps after `GAP:`.

Only naval units and amphibious operations (18.0) and the optional rules (21.0) are deferred. Calling a deferred or unknown feature through `requireImplementedRuleFeature` returns `UNSUPPORTED_RULE_FEATURE`; the engine must never silently approximate it.

An item may become `IMPLEMENTED` only when it has a rule citation, owner, public action or query, positive/negative tests, and integration coverage.
