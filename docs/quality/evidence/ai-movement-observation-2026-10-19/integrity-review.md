# Independent movement observation integrity review

No remaining blocker was found for the bounded passive movement observer and descriptive reader. This verdict applies to the fresh `reproduced/` payloads and the exact hashes below. It does not close P10, product UI acceptance, atomic-predicate coverage, target/control joins, or VP prediction qualification. Lost-source producer outputs were not used as completion evidence.

The observer worktree is based on `967a49a599c948000dd3eb4034ed5a9e696b2d97`. The reader is in the root checkout at `76bc5bb2af37a9f59b0563943019d675f87fe9f9`. Source review used the poteto-mode, TypeScript best-practices, type-system-discipline, and comment-sicko instructions. Type-system discipline informed inspection of the versioned observation union and required nonempty movement payload.

## Independently checked evidence

Read-only parsers verified all 11 hashes in `equivalence/summary.json`, all seven source hashes, the recorded fixture hash, and both current and frozen JavaScript build-tree hashes against files on disk. They compared every non-observation payload field for frozen baseline, observation disabled, and observation enabled. This includes exact choices, memory before and after, access and RNG arguments and raw results plus hashes, dispatch actions/status/events/violations, every recorded state hash, and accepted actions.

| Fixture | Decisions | Access calls | RNG calls |
|---|---:|---:|---:|
| Generated heuristic | 129 | 1594 | 0 |
| Generated random control | 33 | 352 | 443 |
| Recorded movement prefix | 30 | 375 | 0 |

The frozen-policy control matches the generated baseline's full behavior and emits 129 version-1 `QUERY_ONLY` reports, all with uninstrumented candidate evaluation. This establishes the no-writer control on the new runner.

Independent reconstruction checked all 69 movement groups and 13737 scored candidates. It checked stay/base/retained sums, correction eligibility and actual ordered first-12 membership, capture-priority improving order, query membership, actual ordered explanation-call matches, composite correction and supply results, skip reasons, and selected choice/first-attempt identity. Base terms retain the original supply penalty when an applied correction removes it from retained terms. The counts reconcile to 27 applied corrections, 329 refused corrections, 540 budget skips, 39 final-supply refusals, and 58 selected groups. One generated group executes 13 final-supply checks, confirming that the correction cap does not cap final checks.

The fresh CLI contains 30 reports, with 19 `QUERY_ONLY` and 11 `QUERY_AND_MOVEMENT`. Manifest counts, run identities, versions, coverage, completion, and initial/final save hashes reconcile. Five producer-log hashes and both CLI manifest/observation hashes match `verification.json`.

Typecheck, build, eight focused tests, study execution, CLI execution, and save/load assertions passed according to the producer logs and verifier. This reviewer did not rerun games, tests, builds, or save/load. The frozen build's contents were hash-checked, not independently rebuilt.

## Descriptive analysis

The final reader validates its input SHA against the equivalence summary. Independent calculations reconcile both generated and recorded reports' global and per-role counts, all eight pooled/equal-group rates, term-crossing populations, and per-assigned-target counts. Zero-denominator groups are excluded from equal-group means and their support is explicit. Assigned target keys retain purpose and hex identity. They are planning targets, not verified objective control.

Two review findings were corrected before this verdict. The reader now retains assigned-target identity, and now reports applied/checked correction rates. Generated applied/checked is 23/273 pooled and approximately 0.060147 as an equal-group mean over 33 groups. Recorded applied/checked is 4/83 pooled and 0.2 as an equal-group mean over 10 groups. These are different estimands, not interchangeable success rates.

The final group outcomes also reconcile. Across both inputs, 39 route refusals occur in six groups. Five still select another candidate, one exhausts improving candidates through supply refusal, and ten other groups have no improving candidate. Raw refusal counts therefore do not measure how many groups fail to select a move.

Term deletion removes each term from both candidate and stay. Recorded decision 1, candidate `candidate:45`, has margin -32, candidate cover 0, and stay cover 38. Removing cover gives -32 - (0 - 38) = 6. Generated decision 1, candidate `candidate:12`, has margin approximately -2.934783 and comparative exposure approximately -8.934783, producing margin 6. Independent totals also match crossings restricted to groups without selection. Crossings overlap. Repeated candidates, groups, and assigned targets are dependent. These diagnostics do not establish hypothetical supply, priority, selection, retained control, causal effects, or VP gains.

## Comment and suppression audit

Reviewed the seven observer files and the root reader. No suppression was found in the scoped files. The only added comment documents the public optional observation-writer contract and fits the API-contract exception. No comment deletion or `MUST KILL` flag is required for this diff. Existing unchanged policy rationale comments were excluded from cleanup. No source was modified by this reviewer.

## Exact provenance

Observer source-set SHA-256 is `b2a4ecd365746560ad58b9888b232e9c4bf8aca6568c22ccaa0a20e7ff7cec89`. Reader SHA-256 is `d63e2a3714a2cf042ac0dcd542e1e55fb955d55154964de03dbc18d73382e9c8`. Equivalence summary SHA-256 is `90ff35728f9b9490b8215719d72e59f1b98b9099a4a12f44dc1126d50ccd0e29`.

| Source | SHA-256 |
|---|---|
| `src/ai/model.ts` | `186ca1889259c62dde4d005d11b1f612da73f5e95ca493b85ce76431603d833b` |
| `src/ai/observation.ts` | `cb51187fb5c193626848293d53f4816da8affd30cd3c501eb394985fb5c655b1` |
| `src/ai/seat-runner.ts` | `57f62ef0c4e5f3241334e362d3204739afc28fe635e15358d97573abcfb3d51c` |
| `src/ai/policies/heuristic.ts` | `756c7ee53d46ef439edec8fa96d176549f4427c938881a65253d102ff087b349` |
| `scripts/ai-match.mjs` | `16c7326b6776d1f906ada94563f5425b8a4eefa6b236057fcf02515aed1df698` |
| `scripts/ai-observation-study.mjs` | `841f576767541cb3029c19e2768baf251baf5b51e546347b4ca0e21e1f80fa31` |
| `tests/ai/movement-observation.test.ts` | `74f106d4cdf042af8fb47f0328ac49a02fb1f5c21b3e856fa0fb1552b1941f4f` |

- `equivalence/enabled.json` SHA-256 is `03d33dd54ec23518831d4c9b2582449a7995e3bf0ce306fb52c3e6a7bb12ed88`.
- `equivalence/recorded-enabled.json` SHA-256 is `349287eaeaca5cb9d5a8c6cdd5d457b1eaa58e5cba6ae61d9d51e82d1c0f3c6c`.
- `gates-generated.json` SHA-256 is `baf4d59b818ab2e04bb062bbb686315bf35dcef69e093a7f731a0685afca8c6f`.
- `gates-recorded.json` SHA-256 is `e5f2fbb379d407d269110305c331896bf0b30e0fa4f65614b2ec641236309506`.
