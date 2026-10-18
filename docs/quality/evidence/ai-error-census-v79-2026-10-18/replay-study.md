# Replay study

32 games from artifacts/ai-assault/v84-development/meeting-temperate, artifacts/ai-assault/v84-development/meeting-eastern, artifacts/ai-assault/v84-development/attack-temperate, artifacts/ai-assault/v84-development/attack-eastern.

| policy / outcome | sides | objectives lost while empty | lost while defended | objectives gained | step losses by cause (per side) | out-of-supply unit-turns | attacks | never moved | combat steps kept | final VP |
|---|---|---|---|---|---|---|---|---|---|---|
| heuristic attacker lost | 3 | 0.0 | 0.0 | 1.3 | combat defending 9.0; attrition (out of supply) 6.7; combat attacking 4.0; overrun attacking 1.0; other (declare_air_mission) 1.0; air_mission attacking 0.7; overstack 0.7; overrun defending 0.3 | 10.7 | 11.0 | 0.7 | 76% | 2.0 |
| heuristic attacker won | 5 | 0.0 | 0.0 | 4.8 | attrition (out of supply) 3.0; combat defending 3.0; other (declare_air_mission) 0.6; combat attacking 0.6; overrun attacking 0.4; overrun defending 0.2; overstack 0.2; air_mission attacking 0.2 | 4.4 | 15.6 | 1.0 | 93% | 12.4 |
| heuristic defender lost | 5 | 1.4 | 3.4 | 0.0 | combat defending 17.0; attrition (out of supply) 10.4; combat attacking 3.4; barrage defending 1.0; overrun defending 0.6; overstack 0.4; air_mission defending 0.2; other (declare_air_mission) 0.2 | 21.2 | 5.6 | 1.6 | 33% | 3.2 |
| heuristic defender won | 3 | 1.0 | 0.3 | 0.0 | combat defending 7.3; attrition (out of supply) 3.3; combat attacking 2.0; barrage defending 1.0; overrun defending 1.0; air_mission defending 0.3 | 10.0 | 9.0 | 9.3 | 78% | 10.0 |
| heuristic draw | 4 | 1.0 | 0.5 | 1.5 | attrition (out of supply) 10.5; combat defending 7.8; combat attacking 0.8; barrage defending 0.5; overrun defending 0.3 | 19.3 | 7.0 | 2.3 | 62% | 6.5 |
| heuristic lost | 6 | 1.7 | 1.8 | 1.8 | attrition (out of supply) 11.0; combat defending 6.2; combat attacking 3.5; overrun defending 1.3; overrun attacking 0.5 | 15.7 | 8.2 | 5.0 | 62% | 13.2 |
| heuristic won | 6 | 0.7 | 1.2 | 3.5 | combat defending 5.7; attrition (out of supply) 4.7; combat attacking 2.0; overrun attacking 0.3; barrage defending 0.3; overrun defending 0.3; other (declare_barrage) 0.2 | 10.8 | 8.5 | 5.2 | 80% | 18.8 |
| v79-frozen attacker lost | 3 | 0.0 | 0.0 | 1.3 | combat defending 9.0; attrition (out of supply) 6.7; combat attacking 4.0; overrun attacking 1.0; other (declare_air_mission) 1.0; air_mission attacking 0.7; overstack 0.7; overrun defending 0.3 | 10.7 | 11.0 | 0.7 | 76% | 2.0 |
| v79-frozen attacker won | 5 | 0.0 | 0.0 | 4.8 | attrition (out of supply) 3.0; combat defending 3.0; other (declare_air_mission) 0.6; combat attacking 0.6; overrun attacking 0.4; overrun defending 0.2; overstack 0.2; air_mission attacking 0.2 | 4.4 | 15.6 | 1.0 | 93% | 12.4 |
| v79-frozen defender lost | 5 | 1.4 | 3.4 | 0.0 | combat defending 17.0; attrition (out of supply) 10.4; combat attacking 3.4; barrage defending 1.0; overrun defending 0.6; overstack 0.4; air_mission defending 0.2; other (declare_air_mission) 0.2 | 21.2 | 5.6 | 1.6 | 33% | 3.2 |
| v79-frozen defender won | 3 | 1.0 | 0.3 | 0.0 | combat defending 7.3; attrition (out of supply) 3.3; combat attacking 2.0; barrage defending 1.0; overrun defending 1.0; air_mission defending 0.3 | 10.0 | 9.0 | 9.3 | 78% | 10.0 |
| v79-frozen draw | 4 | 1.0 | 0.5 | 1.5 | attrition (out of supply) 10.5; combat defending 7.8; combat attacking 0.8; barrage defending 0.5; overrun defending 0.3 | 19.3 | 7.0 | 2.3 | 62% | 6.5 |
| v79-frozen lost | 6 | 1.7 | 1.8 | 1.8 | attrition (out of supply) 11.0; combat defending 6.2; combat attacking 3.5; overrun defending 1.3; overrun attacking 0.5 | 15.7 | 8.2 | 5.0 | 62% | 13.2 |
| v79-frozen won | 6 | 0.7 | 1.2 | 3.5 | combat defending 5.7; attrition (out of supply) 4.7; combat attacking 2.0; overrun attacking 0.3; barrage defending 0.3; overrun defending 0.3; other (declare_barrage) 0.2 | 10.8 | 8.5 | 5.2 | 80% | 18.8 |

## How objectives were lost (per side)

- heuristic attacker lost: none
- heuristic attacker won: none
- heuristic defender lost: combat advance 3.4; moved through by COMBAT 1.0; moved through by HQ 0.4
- heuristic defender won: moved through by COMBAT 1.0; combat advance 0.3
- heuristic draw: moved through by COMBAT 0.8; combat advance 0.5; moved through by HQ 0.3
- heuristic lost: combat advance 1.8; moved through by COMBAT 1.2; moved through by HQ 0.5
- heuristic won: combat advance 1.2; moved through by COMBAT 0.7
- v79-frozen attacker lost: none
- v79-frozen attacker won: none
- v79-frozen defender lost: combat advance 3.4; moved through by COMBAT 1.0; moved through by HQ 0.4
- v79-frozen defender won: moved through by COMBAT 1.0; combat advance 0.3
- v79-frozen draw: moved through by COMBAT 0.8; combat advance 0.5; moved through by HQ 0.3
- v79-frozen lost: combat advance 1.8; moved through by COMBAT 1.2; moved through by HQ 0.5
- v79-frozen won: combat advance 1.2; moved through by COMBAT 0.7
