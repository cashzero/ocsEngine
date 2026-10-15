# Beyond the Rhine OOB catalog study

The inspected `buildFile.xml` is module `OCS - Beyond the Rhine` version 1.27.0, authored for VASSAL 3.7.24. SHA-256 is `686ECB3090F89AC3952E01C28B3E6446A2315424428652D22DCA3FB5F75212AD`. The file contains 1,320 fully qualified PieceSlot nodes nested under counter-window tabs and panels.

PieceSlot `entryName`, `gpid`, ancestry, and encoded traits were compared. The reviewed runtime-independent subset contains 18 records: matched Allied/Axis command, armored/infantry/mobile combat, artillery, reconnaissance, pontoon/engineer, truck, and supply-dump sources. Markers such as DG, OoS, Exploit, and airbase are not OOB units. Prototype behavior is not executed or copied.

The catalog separates:

- source facts: module/version/hash, GPID, raw name, classification;
- normalized generator design: role, face, ratings, steps, point budget, capability;
- generated identity: seed/side/formation/role ordinal.

VASSAL containers and `.vsav` placement are setup evidence only and are excluded from the base catalog. This makes the reviewed catalog byte-stable and portable without requiring the commercial module at runtime.

