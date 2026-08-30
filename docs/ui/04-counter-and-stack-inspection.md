# U4 — Counter and stack inspection

## Study result

Counters are rendered from projected stacks, not initial scenario piece state. Friendly pieces display name, mode, and remaining steps. Enemy projection policy is preserved: redacted counters say “Enemy unit,” and hidden stack members are represented only by a count.

Selecting a Hex opens its visible stack. Selecting a counter scopes movement candidate discovery through Gameplay's `pieceId` filter. Counter colors identify player ownership but all counters also have accessible text labels, so color is not the sole signal.
