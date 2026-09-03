# M6.8 — UI preview and download

The original M6 delivery used an independent map laboratory. That route was retired by the reopened M8/U10 integration gate because it did not prove that its output became the active game.

The current UI exposes map style, dimensions, and seed inside New Game. **Build operation preview** prepares the map together with OOB and deployment, renders graphical terrain/features and combined metrics, and enables **Start this operation** only for the validated package. Generator-level canonical JSON remains available through the generation API and serialization tests rather than a disconnected player workflow.

The preview distinguishes all terrain classes, river/major-river edges, road/primary-road edges, settlements, and opposing strategic regions. It does not claim the map is playable until Random OOB and M8 deployment validation exist. The UI retains the global 13px text floor.
