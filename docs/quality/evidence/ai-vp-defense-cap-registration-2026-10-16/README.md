# Capped VP defense independent registration

This record is written before starting any independent match. Candidate 72 and
standard 66 are immutable, with source/build hashes bound by registration SHA256.
Source base is `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Both play through the
candidate common engine and generator. Candidate source is exactly the development
freeze, with no further policy changes.

Fixed 80 games/40 swapped-seat pairs; 20 games per map/engagement group;
32×24, six divisions/two armored per side, no aircraft/air transport, eight turns.
Fresh unused indices in registration.json: 1301000–1301019, 1301100–1301119,
1301200–1301219, 1301300–1301319. Registration scans existing artifact saves to
exclude previously played indices.

Acceptance: positive VP delta separately in MEETING and AXIS_ATTACKS; paired
mean −2.1SE >0; every match legal turn 8/COMPLETE with identical replay final hash;
zero ordinary/strict guarded supply violations; full frozen quality passes.
No per-style positivity gate. No pooling, extending or replacing a failed batch.
No Mediterranean games. Existing historical test floors and original timeouts remain.
Run `batch.py <candidate freeze> <baseline freeze> independent`, then
`verify.py <candidate freeze> <baseline freeze> independent --delivered`.
The completed result is a separate immutable evidence record; this registration
is not a claim of success or a UI acceptance result.
