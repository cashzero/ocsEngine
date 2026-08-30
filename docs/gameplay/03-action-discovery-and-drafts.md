# G3 Action Discovery and Drafts

Gameplay delegates action families and deterministic budget-bounded candidates to the Rule Engine after binding the requesting Seat to its Player. Discovery is disabled while the session is not active or a privacy handoff is locked.

An `ActionDraft` contains only Seat, base revision, and a complete Rule action. Gameplay owns no selected Hex, hover, panel, modal, or partial combat participant state. `validateDraft` reports both revision currency and the current Rule explanation; dispatch always revalidates authoritatively.
