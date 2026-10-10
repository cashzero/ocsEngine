# OCS v4.3 Charts and Tables — full text transcription

Every table on the four pages of the OCS v4.3 Charts and Tables, transcribed as printed, whether or not the engine
applies it, so nobody has to open the images again (user request 2026-10-10). Implementation notes, the generated-game
choices and the cross-checks are in [ocs-4.3-charts.md](ocs-4.3-charts.md); the engine data is
`src/rules/tables/ocs-4.3.ts`.

Source: the user-supplied Beyond the Rhine VASSAL module 1.27.0, `images/` (Multi-Man Publishing, © 2018).

| Page | Image | SHA-256 |
|---|---|---|
| 1 | `v4.3 Charts (final)-1 1000.png` | `c12961fdf2eb4c9eb5bf750d81300cd727abe2dc04deccebe59eb89a31c35822` |
| 2 | `v4.3 Charts (final)-2 1000.png` | `0e5b8282b953d8bf389f3461ada4e30bee4ea8897e34390c031ee47d1cc3ad32` |
| 3 | `v4.3 Charts (final)-3 1000.png` | `5484b15276d54a8afd1896692671b6b56a6d0694162d20fbdce39542e16aa96a` |
| 4 | `v4.3 Charts (final)-4 1000.png` | `69b711ebb28640f9c2262677c8a7595b75765e7b130ec7dfc1b61818abbd94c9` |

Conventions: `-` means no result; `1T` is one Token (1 SP = 4T = 1 RE); text in *[Option …]* is an optional rule.

---

## Page 1

### Outline Sequence of Play (2.2)

- **I. Pre-Turn Phase**
  1. Weather Determination Segment
  2. First Player Determination Segment
- **II. First Player, Player Turn**
  - A. Aircraft Refit Phase
  - B. Reinforcement Phase
  - C. Movement Phase
    - Breakout Segment
    - Mode & Movement Segment
    - Barrage Segment (air & ship only)
  - D. Supply Phase
  - E. Reaction Phase
    - Movement Segment
    - Barrage Segment
  - F. Combat Phase
    - Barrage Segment (artillery only)
    - Combat Segment
  - G. Exploitation Phase
    - Movement Segment
    - Barrage Segment
    - Combat Segment
  - H. Clean Up Phase
- **III. Second Player, Player Turn** — repeat the steps of the first player with the roles reversed.
- **IV. Turn End Phase**

### Air Combat Table (14.3e)

Roll two dice for the main table, and a third to see if aborting aircraft take a loss.

| Dice Roll | Result |
|---|---|
| 6 or less | Attacker Aborts |
| 7 | Both Abort |
| 8 or more | Defender Aborts |

Dice Roll Modifiers: add Attacker's Air Combat Rating; subtract Defender's Air Combat Rating.
*[Option 21.4] −1 if beyond half range.* Note these DRMs do not apply to the Loss Die.

| Loss Die | Result |
|---|---|
| 1-4 | No Loss |
| 5-6 | Step Loss |

### Air Transport Success Table (14.10d)

Hex Status: 'Friendly' is any hex occupied by a friendly unit at the beginning of the current phase, otherwise the
hex is 'Enemy'. Terrain Type: 'Clear' is Open or Village, or any hex with an airbase; otherwise 'Closed'.

| Hex Status | Terrain Type | Failure (two dice) | Success (two dice) |
|---|---|---|---|
| Friendly | Clear | 4 or less | 5 or more |
| Friendly | Closed | 5 or less | 6 or more |
| Enemy | Clear | 5 or less | 6 or more |
| Enemy | Closed | 6 or less | 7 or more |

Dice Roll Modifiers:
- −1 if Allied air drop in ETO, 8/44 or before.
- −1 if Soviet air drop, any time.
- +1 if glider landing.
- *[Option 21.12e] −1 if Very Close or −2 if Extr Close.*

### Air Base Capture Table (9.14f)

When an Air Base is captured, roll two dice for each air unit separately to see if it takes a loss. All remaining
aircraft must then displace to another base (within 2x range) and become Inactive.

| Dice Roll | Result |
|---|---|
| 6 or less | Step Loss |
| 7 or more | No Loss |

Dice Roll Modifiers: +2 if the air unit is Active; +2 if base was captured by an advance after combat.

### Flak (14.4e) — roll two dice

Flak Roll Modifiers:

| DRM | Condition |
|---|---|
| +1 | Mission has three or more air units |
| | **Target Hex Contains…** |
| +1 | One or more HQs |
| +# | Air Base Level (Airstrips = 0) |
| +# | Value of map-printed Flak or total ship Flak |
| | **Target is in Enemy PZ and…** |
| +1 | Mission has at least one Fighter |
| +2 | Mission has no Fighters |
| +1 | Mission is Trainbusting (cumulative with the above) |

- Always roll Flak: Barrage, Hip Shoot, & Trainbusting.
- Only roll Flak in PZ: Air Transport/Drop, & Base Transfer.
- Never roll Flak: Fighter Sweep & Interception.

Procedure: add the applicable modifiers to the Flak Roll. If the modified roll is 11 or more, kill one mission
aircraft step. Otherwise, the Flak has no effect. Use the Mission Loss Table to determine which air unit in a stack
takes the loss.

### Mission Loss Table (14.4f) — roll one die

| Roll | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 2 aircraft | #1 | #1 | #1 | #2 | #2 | #2 |
| 3 aircraft | #1 | #1 | #2 | #2 | #3 | #3 |
| 4 aircraft | #1 | #2 | #3 | #4 | W | S |

'#' is the aircraft's position in the mission stack. 'W' refers to the weakest aircraft and 'S' to the strongest
aircraft in terms of barrage strength (owning player gets choice if there is one).

---

## Page 2

### Combat Sequence Summary (9.2)

1. The attacker identifies the defending and attacking hexes.
2. Both players expend required SPs. The defender can spend no supply and defend at half strength.
3. The attacker identifies his Action Rating unit, followed by the defender identifying his.
4. The defender announces terrain choices (9.3b) and players determine the initial odds.
5. Announce Action Rating values, attacker first then the defender (9.6).
6. Roll two dice to determine Surprise. Modify the odds column as per 9.8.
7. Roll two dice, modify by the DRM in 9.6 to determine the result (9.10).
8. Execute the results — attacker first, then the defender.
9. Perform retreats and advances (9.12).

### Surprise Rolls (9.8)

Roll two dice, add the AR differential for the combat. If a player gains surprise, roll one die for column shifts.

| Attack | Roll | Result |
|---|---|---|
| Overrun | 9 or more | Attacker gains Surprise |
| Overrun | 6 or less | Defender gains Surprise |
| Regular | 10 or more | Attacker gains Surprise |
| Regular | 5 or less | Defender gains Surprise |

Dice Roll Modifiers: −1 if defender in Hedgehog (any Level).

### Anti-Tank Effects (9.4e)

Reduce a x2 Terrain Effect for attacking Armor or Mech to x1.5 when the defender's hex has the same or higher level
of AT.

- a) Heavy AT Effects are given to hedgehogs, all Yellow-coded units, Red-coded units with Tank symbol (such as
  Soviet Tank Brigade), and Anti-Tank or Anti-Aircraft units.
- b) Light AT Effects are given to Red-coded units which do not have a tank symbol.
- c) No AT Effects are given to all other unit types.

### Action Rating Mods (9.6)

- −1 if unit is in DG Mode.
- Units in Strat Mode reduce their printed Action Rating to zero.

### Combat Supply (9.5)

- Attacker: 1T per attacking step (DAK 2-step brigades cost 1T).
- Defender: 2T per combat (if 1 RE or less, cost is 1T).

Units can use Internal Stocks (12.10) only if on-map supply is unavailable. Defenders have the option to withhold
combat supply and defend at 1/2.

Size Equivalents: 1 RE = 1 SP = 4T.

### Capture Table (9.14b & 9.14c) — roll one die

Check each category in the hex separately when enemy Attack-Capable units enter the hex.

| Roll | Dump (on ground) ¹ | Trucks (and loaded SPs) ²˒⁴ | Wagons (and loaded SPs) ³˒⁴ |
|---|---|---|---|
| 1 | 0 | 0 | 0 |
| 2 | 25 | 0 | 0 |
| 3 | 25 | 25 | 25 |
| 4 | 50 | 50 | 50 |
| 5 | 50 | 50 | 75 |
| 6 | 75 | 75 | 100 |

Explanation of Results: number is % captured. The rest is handled per the notes below:
1. Remainder is destroyed.
2. Remainder displaces up to 10 hexes.
3. Remainder displaces up to 5 hexes.
4. Captured vehicles can immediately move if captured during the Movement Phase.

*Note Extenders collapse per 9.14d.*

### Attrition Table (12.8b) — roll two dice

Use the column of the best AR in stack that is OOS.

| AR 5 | AR 4 | AR 3 | AR 2 | AR 1 | AR 0 | Result |
|---|---|---|---|---|---|---|
| 2-8 | 2-7 | 2-5 | 2-3 | 2 | - | No Loss |
| 9-10 | 8-9 | 6-7 | 4-5 | 3-4 | 2-3 | −1 Step |
| 11 | 10 | 8-9 | 6-7 | 5-6 | 4-5 | −2 Steps |
| 12 | 11 | 10-11 | 8-9 | 7-8 | 6-7 | −4 Steps |
| 13+ | 12+ | 12+ | 10+ | 9+ | 8+ | − All Steps |

Dice Roll Modifier: +3 if there are 5 or more steps in hex.

### Dump Blowing (12.11a)

Roll one die. Attempts can be made in all three friendly movement segments.

| Roll | % Destroyed |
|---|---|
| 1 | 25 |
| 2-3 | 50 |
| 4-5 | 75 |
| 6 | 100 |

### Explanation of Combat Results (9.10)

| Code | Meaning |
|---|---|
| A | Attacker |
| D | Defender |
| L# | Loss Number, lose # steps. |
| o# | Option Number, retreat or step loss option. |
| DG | Defender is Disorganized. |
| e# | Attackers with action ratings of # or more are exploitation marked. Note e# results only apply to attacks made in the Combat Phase. |

Notes:
1. If the attacker takes his option as a retreat void any exploitation result.
2. The defender can ignore his options if the attacker chooses to use an option to retreat or if the attacker is
   destroyed before taking any options. The defender can choose to apply his full option even if it was negated.
3. A retreat of 2 or more hexes triggers a DG result the instant a combat unit enters the second hex of its retreat.
4. No attack involving three or more attacking hexes OR any two non-adjacent hexsides ever generates an exploit
   result. Ignore any "e" result in such an attack, but apply the remaining results normally.

---

## Page 3

### Combat Table (9.9) — roll two dice

Dice Roll Modifiers: add the Action Rating of the selected attacking unit. Subtract the Action Rating of the selected
defending unit and the Hedgehog Level (if any is in the hex).

Odds columns by the defender's combat line (column 1 to 13):

| Line | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Extr Close | 1:2 | 1:1 | 2:1 | 3:1 | 4:1 | 8:1 | 12:1 | 16:1 | 20:1 | 28:1 | 36:1 | 44:1 | 52:1 |
| Very Close | 1:3 | 1:2 | 1:1 | 2:1 | 3:1 | 4:1 | 6:1 | 9:1 | 12:1 | 15:1 | 18:1 | 21:1 | 24:1 |
| Close | 1:4 | 1:3 | 1:2 | 1:1 | 2:1 | 3:1 | 4:1 | 6:1 | 8:1 | 10:1 | 12:1 | 15:1 | 18:1 |
| Open | 1:5 | 1:4 | 1:3 | 1:2 | 1:1 | 2:1 | 3:1 | 4:1 | 5:1 | 7:1 | 9:1 | 11:1 | 13:1 |

Results, attacker / defender (`-` no result):

| Roll | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 or less | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | AL1/Do1 | AL1/DL1o1 |
| 2 | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | AL1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 |
| 3 | AL2/- | AL2/- | AL2/- | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | AL1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 |
| 4 | AL2/- | AL2/- | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 |
| 5 | AL2/- | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 |
| 6 | AL2/- | AL2/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ae4/DL1o2 | Ae4/DL1o2 |
| 7 | AL1o1/- | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG |
| 8 | AL1o1/- | AL1o1/Do1 | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG |
| 9 | AL1o1/Do1 | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG |
| 10 | AL1o1/Do1 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG |
| 11 | AL1o1/Do1 | AL1/Do1 | Ao1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ae4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG |
| 12 | AL1o1/Do1 | Ao1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG | Ae2/DL2o3DG |
| 13 | Ao1/Do1 | Ao1/Do1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o2 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG |
| 14 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG |
| 15 or more | Ao1/DL1o1 | Ao1/DL1o1 | Ao1e4/DL1o2 | Ae4/DL1o2 | Ae4/DL1o2 | Ae3/DL2o2DG | Ae3/DL2o2DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG | Ae2/DL2o3DG |

Checked cell by cell against the image and against `COMBAT_TABLE_ROWS` (2026-10-10).

Surprise Roll Basics (a complete summary is on chart page 2): Overrun attacks — 9 or more, Attacker Surprise; 6 or
less, Defender Surprise. Regular attacks — 10 or more, Attacker Surprise; 5 or less, Defender Surprise.

---

## Page 4

### Barrage Table (10.0a) — roll two dice

Use the column for Barrage Strength and apply column shifts that apply. The Cost row is the artillery supply cost.

| Roll | 1 or less | 2 | 3-4 | 5-7 | 8-11 | 12-16 | 17-24 | 25-40 | 41-68 | 69-116 | 117+ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Cost | 1T | 1T | 2T | 2T | 2T | 3T | 3T | 4T | 6T | 8T | 10T |
| 2 | - | - | - | - | - | - | - | - | - | DG | DG |
| 3 | - | - | - | - | - | - | - | - | DG | DG | DG |
| 4 | - | - | - | - | - | - | - | DG | DG | DG | DG |
| 5 | - | - | - | - | - | - | DG | DG | DG | DG | [1/2] |
| 6 | - | - | - | - | - | DG | DG | DG | DG | [1/2] | [1/2] |
| 7 | - | - | - | - | DG | DG | DG | DG | [1/2] | [1/2] | 1/2 |
| 8 | - | - | - | DG | DG | DG | DG | [1/2] | [1/2] | 1/2 | 1/2 |
| 9 | - | - | DG | DG | DG | [1/2] | [1/2] | [1/2] | 1/2 | 1/2 | 1/2 |
| 10 | - | DG | DG | DG | [1/2] | [1/2] | 1/2 | 1/2 | 1/2 | 1 | 1 |
| 11 | DG | DG | DG | 1/2 | 1/2 | 1/2 | 1/2 | 1/2 | 1 | 1 | 2 |
| 12 | DG | 1/2 | 1/2 | 1/2 | 1/2 | 1 | 1 | 1 | 1 | 2 | 3 |

Checked cell by cell against the image and against `BARRAGE_TABLE_ROWS` / `BARRAGE_TABLE_COLUMNS` (2026-10-10).

Roll once for hex. Owner's choice of unit(s) which take the step loss (exception: no choice for targeted ship).

Explanation of results:
- `-` No Effect.
- `#` Lose # steps and become DG.
- `DG` Target is disorganized. All combat units in the hex are now in DG mode.
- `[1/2]` If in a Level 3 or 4 Hedgehog, an Air or Ship Fire, OR else no correct spotter treat as DG. Otherwise check
  as regular 1/2.
- `1/2` Roll one die, on a 4-6 lose one step and become DG. Otherwise become DG only.

### Density Shifts — RE's in hex (don't round)

| Shift | RE in hex |
|---|---|
| Left 1 | 1 RE or less |
| None | Greater than 1 RE, up to 3 |
| Right 1 | Greater than 3 RE, up to 4 |
| Right 2 | Greater than 4 RE, up to 5 |
| Right 3 | Greater than 5 RE, up to 6 |
| Right 4 | Greater than 6 RE |

Only combat units count for density — not transport points, SPs, etc. No multi-step unit or multi-unit formation
ever counts as more than 3 RE for this purpose.

### Additional Shifts

Use all lines which apply (but a line can only be applied once).

| Shift | Condition |
|---|---|
| Left 1 | For a Hedgehog of any level (see also [1/2] result) |
| Left 1 | For a Close or Very Close terrain hex |
| Left 2 | For an Extremely Close terrain hex |
| Left 3 | For no correct spotter adjacent to target (this always applies to a barrage with any Strategic Bombers) |
| Right 3 | If any unit in the target hex in Strat Mode |
| Right 1 | If all aircraft are at or within 10 hexes of their base |
| Left 1 | *[Option 21.4] If any aircraft flew more than half range* |

Reduce these ship-to-shore barrage results (18.3b): 1/2 (either kind) becomes DG; 1 becomes 1/2; 2 becomes 1.

### Barrage vs Facility Table (10.0c) — roll one die

Use the column for Barrage Strength. The Cost row is the artillery supply cost.

| Roll | 1 or less | 2 | 3-4 | 5-10 | 11-20 | 21-40 | 41-80 | 81+ |
|---|---|---|---|---|---|---|---|---|
| Cost | 1T | 1T | 1T | 1T | 2T | 4T | 6T | 8T |
| 1 | - | - | - | - | - | - | (5) | 1 (5) |
| 2 | - | - | - | - | - | (5) | 1 (4) | 1 (4) |
| 3 | - | - | - | - | (5) | 1 (5) | 1 (4) | 1 (4) |
| 4 | - | - | - | \* (6) | 1 \* (5) | 1 \* (4) | 1 \* (4) | 2 \* (4) |
| 5 | - | (6) | \* (6) | 1 \* (5) | 1 \* (4) | 2 \* (4) | 2 \* (4) | 2 \* (3) |
| 6 | (6) | \* (5) | 1 \* (5) | 1 \* (4) | 1 \* (4) | 2 \* (4) | 2 \* (3) | 2 \* (3) |

Explanation of results:
- `-` No Effect.
- `*` Trainbusting barrage is successful.
- `1` Air Base reduced by one level (min Level is 1), or a Port takes 1 hit (max 4 hits).
- `2` Air Base reduced by two levels (min Level is 1), or a Port takes 2 hits (max 4 hits).
- `(#)` When an Air Base is the target, use the number in parentheses to separately check each plane at that Air Base
  for loss. Roll this number or more (1 die) to reduce the air unit.

### Port Damage (19.0b)

| 1 Hit | 2 Hits | 3 Hits | 4 Hits |
|---|---|---|---|
| 80% | 60% | 40% | 20% |

Damaged ports that do not have printed Damage Tracks have their capacity reduced to the percentage indicated. Round
this to nearest token, so 80% of 1 SP is 3T, etc.
