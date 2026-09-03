# M6.5 — Connected road network

Strategic nodes are both entry/supply Hexes and every settlement. Starting at the first entry, the generator repeatedly joins the nearest unconnected node to the existing tree using deterministic A* over land. Terrain affects path cost; water is excluded.

Source-to-backbone and opposing-entry routes use `edge:primary-road`; remaining branches use `edge:road`. Edges merge by canonical Hexside ID, so river crossings may coexist without duplicate roads. The final graph must have exactly one component and contain every strategic node.

