# M7.0 BCS/BTR OOB source study

## Sources inspected

- `E:\work\bcsEngine\utils\scenarioGenerator.ts`: seeded ranking, formation blueprint selection, force-size controls, independent-support selection, and post-generation validation.
- `E:\work\Beyond the Rhine_1_27_0\buildFile.xml`: VASSAL 3.7.24 module `OCS - Beyond the Rhine`, module version `1.27.0`.
- BTR build file SHA-256: `686ECB3090F89AC3952E01C28B3E6446A2315424428652D22DCA3FB5F75212AD`.
- XML inventory: 1,320 fully qualified `VASSAL.build.widget.PieceSlot` nodes.

## Reuse decision

Reuse the BCS pipeline shape: explicit options, one seeded random stream, reviewed template selection, complete packages, independent support, validation, and seed sweeps. Do not reuse BCS deployment/objective placement, HQ command mechanics, Combat Trains, activation, SNAFU, AV, or engagement-zone semantics. M7 stops before location assignment.

## Reviewed BTR evidence set

The embedded catalog records 18 source locators covering both sides and all required roles. Representative locators include Allied HQ GPID 319, armored combat GPID 160, infantry GPID 339, airborne/mobile GPID 385, artillery GPID 164, recon GPID 163, truck GPID 77, pontoon GPID 466, and supply dump GPID 321. Axis counterparts include GPIDs 1103, 733, 826, 806, 739, 737, 71, 713, and 359.

The build file is a reference corpus, not a runtime dependency. Each generated Piece Definition stores module/version, SHA-256, GPID locator, raw `entryName`, confidence, and review status.

The official game-specific OOB/rating sources were not available in the reference directory. Therefore M7 completes the requested random OOB as a traceable OOB-inspired generator; it does not mislabel the PieceSlot palette as an exact historical scenario. Exact historical import remains a separately reviewed data mode, not a hidden fallback in this generator.
