# M7.6 Validation contract

Generation fails closed if either the Foundation Piece Definition validator or OOB composition validator reports an error. The OOB validator proves:

- exactly one Allied and one Axis side and the requested formation count;
- unique unit and Piece Definition IDs with an exact one-to-one mapping;
- side/formation ownership consistency;
- command, combat, organic artillery, independent artillery, engineer, transport, and supply invariants;
- positive integral point costs and at least a 90% opposing-force balance ratio;
- valid faces, contiguous steps, exact quantities, resource profiles, source references, and catalog provenance.

No retry or partial output hides an invalid composition. Seed sweep exceptions and validation failures are counted separately and retain seed/error codes.

