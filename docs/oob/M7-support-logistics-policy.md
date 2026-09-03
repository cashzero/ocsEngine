# M7.5 Independent support and logistics policy

Every side receives independent artillery, engineer/pontoon, transport, and supply units. Compact and standard scales allocate at least one package and then one package per two formations. Large scale allocates artillery, transport, and supply per formation plus engineers per two formations.

Independent units have `formationId: null` and remain owned by their side. This preserves a clean seam for M8 to attach scenario players and deployment locations. Supply is modeled with the Foundation exact-resource profile; transport declares explicit supply-token capacity.

M7 does not calculate supply paths, fuel consumption, placement, stacking, or reinforcement arrival. Those decisions require the generated map and scenario state and therefore remain downstream.

