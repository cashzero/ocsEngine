# doc 03 §E: UI rows at 1920×1080

- screenshot 01-ui-new-game-configure.jpg
- screenshot 02-ui-new-game-preview.jpg
- screenshot 03-ui-ng07-mounted.jpg
- screenshot 04-ui-ng07-unit-selected.jpg
- screenshot 05-ui-ng07-roster.jpg
- screenshot 06-ui-menu.jpg
- screenshot 07-ui-contact-start.jpg
- screenshot 08-ui-fuel-panel.jpg
- screenshot 09-ui-move-preview.jpg
- screenshot 10-ui-handoff-prompt-2.jpg
- screenshot 11-ui-privacy-2.jpg
- screenshot 12-ui-other-seat-turn.jpg
- PASS UI-01: At 1920×1080 the map remains dominant; the single left deck does not scroll; primary commands and current phase/seat remain visible — observed: 8 game screens: map share 75–75%; deck scrolling itself on none; End/phase hidden on none
- PASS UI-03(1920): Minimum computed size of visible interface text is 12 px (relaxed from 13 px by the user, 2026-10-14); no illegible clipped labels (screenshots) — observed: smallest per screen: new-game-configure 12px, new-game-preview 12px, ng07-mounted 13px, ng07-unit-selected 13px, ng07-roster 13px, menu 13px, contact-start 13px, fuel-panel 12px, move-preview 12px, handoff-prompt-2 13px, privacy-2 13px, other-seat-turn 13px; below 12 px: none
- PASS UI-04(1920): Zero uncaught exception or error log while repeating NG-07 and an overrun turn — observed: 0 errors

Ended at: Turn 1 / 2, Axis player turn, Movement

Console/page errors: 0

