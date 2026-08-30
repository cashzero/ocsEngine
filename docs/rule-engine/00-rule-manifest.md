# R0 Rule Manifest

The executable manifest is `src/rules/manifest.ts`. Every Rule Engine capability is classified as `IMPLEMENTED`, `DEFERRED`, `GAME_SPECIFIC`, or `NOT_APPLICABLE`, with owning module, OCS rule citation, public actions/queries, tests, and a scope note.

Implemented ground/logistics capabilities cover sequence, mode, stacking, purpose-specific ZOC, ground movement, transaction/reservation, trace/dump supply, regular combat, overrun, artillery barrage, retreat/advance, reinforcement, cleanup, and a generic victory adapter.

Rail/sea/air transport, extender/attrition/breakout detail, air power, naval/shipping, and optional rules are deferred. Calling a deferred or unknown feature through `requireImplementedRuleFeature` returns `UNSUPPORTED_RULE_FEATURE`; the engine must never silently approximate it.

An item may become `IMPLEMENTED` only when it has a rule citation, owner, public action or query, positive/negative tests, and integration coverage.
