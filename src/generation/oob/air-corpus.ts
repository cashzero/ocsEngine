/**
 * Aircraft counters transcribed from the Beyond the Rhine VASSAL module 1.27.0 (`buildFile.xml`
 * PieceSlots with the AAir/XAir prototypes; ratings read from both faces). See
 * docs/oob/counter-corpus.md for the review notes and the counters left out.
 *
 * Values: [Air Combat Rating, Barrage Strength]; `parenthesized` marks a rating printed in
 * parentheses (14.3a). Range is in hexes (14.2d).
 */
export interface AirCounterSource {
  readonly entryName: string;
  readonly gpid: number;
  readonly side: 'ALLIED' | 'AXIS';
  readonly designation: string;
  readonly type: 'F' | 'T' | 'TPT';
  readonly parenthesized: boolean;
  readonly range: number;
  /** Transport capacity of the full and reduced sides in half-Tokens (1T = 2): C-47 1T / 1/2T (14.9a). Transports only. */
  readonly capacity?: readonly [number, number];
  /** 14.10f: the counter contains a glider the Transport always tows. */
  readonly integralGlider?: boolean;
  readonly full: readonly [number, number];
  readonly reduced: readonly [number, number];
  readonly front: string;
  readonly frontSha256: string;
  readonly back: string;
  readonly backSha256: string;
}

export const AIR_COUNTER_CORPUS: readonly AirCounterSource[] = Object.freeze([
  { entryName: 'US P-38', gpid: 94, side: 'ALLIED', designation: 'P-38', type: 'F', parenthesized: false, range: 186, full: [5, 10], reduced: [4, 5], front: 'BTR S01 R11 C14F.png', frontSha256: '5dc48d955c92149ae1a4cf6109a8b5d3fe67edfec13027113480e568fe0c33e9', back: 'BTR S01 R11 C14B.png', backSha256: '7dde357c7138a6ba0d05ae8356d5cfd1deaf22e6f9b8d2d0a659d464c1caef6b' },
  { entryName: 'US P-47', gpid: 497, side: 'ALLIED', designation: 'P-47', type: 'F', parenthesized: false, range: 114, full: [5, 8], reduced: [4, 4], front: 'BTR S01 R12 C01.png', frontSha256: '20b715d5c4d1224fdbcc6b74e078be41750dfdd522f30ca91e63e267517dd4b3', back: 'BTR S01 R12 C01B.png', backSha256: '4ccd17ec45f5e107d92830a0c3c577ae7db8a6a7b67a3013cc17a49e0bdc967d' },
  { entryName: 'US P-51', gpid: 502, side: 'ALLIED', designation: 'P-51', type: 'F', parenthesized: false, range: 136, full: [6, 4], reduced: [5, 2], front: 'BTR S01 R13 C05.png', frontSha256: 'e710b63237694ab4d0e998f2399ccb5346940821ce82c300961dd61539c96c66', back: 'BTR S01 R13 C05B.png', backSha256: '2281b20f851ce48d582328cdad2a5f3fba89b67bd25cf2cddfe1831392996e50' },
  { entryName: 'US A-20', gpid: 492, side: 'ALLIED', designation: 'A-20', type: 'T', parenthesized: true, range: 150, full: [2, 10], reduced: [1, 5], front: 'BTR S01 R11 C09.png', frontSha256: '7c90e68e6832659772c93c25088d957a40c1cdf20ad2a526d8145775203eeef3', back: 'BTR S01 R11 C09B.png', backSha256: '491503a23bfb094f4d6b2d51cb8b69b588f2d41d5d6a92c4055db896c8a85b65' },
  { entryName: 'US A-26', gpid: 503, side: 'ALLIED', designation: 'A-26', type: 'T', parenthesized: true, range: 200, full: [3, 15], reduced: [2, 8], front: 'BTR S01 R13 C07.png', frontSha256: '07e1457665690fd176a964b1732d4edfa6efab09bd496e0dc4f76c93a7011763', back: 'BTR S01 R13 C07B.png', backSha256: '811afd93e1bd89af1f205466df0949f135f68429ca12151c6b88f80564beb71a' },
  { entryName: 'US B-26', gpid: 506, side: 'ALLIED', designation: 'B-26', type: 'T', parenthesized: true, range: 157, full: [3, 10], reduced: [2, 5], front: 'BTR S01 R14 C01.png', frontSha256: 'd9970b48207a48280ba193fdcb8223991c6563d5dcf22c13bbe0cddd50fdc93b', back: 'BTR S01 R14 C01B.png', backSha256: 'aa31ec742404db487a7ef58820cc3c886de23548e9cc69d74cc4c980145366ed' },
  { entryName: 'Ge Bf.109 4-1', gpid: 1280, side: 'AXIS', designation: 'Bf.109', type: 'F', parenthesized: false, range: 76, full: [4, 1], reduced: [3, 0], front: 'BTR S06 R01 C02.png', frontSha256: '8b022ca6c206792f65a5824f4f7011bb3330cdae3135fa2365e2b33a6b264ee3', back: 'BTR S06 R01 C02B.png', backSha256: '81ca3f46d9891191df5755fa2e00abfd095f3effc96946e007d2b6018e83bc3b' },
  { entryName: 'Ge Bf.109 5-1', gpid: 1281, side: 'AXIS', designation: 'Bf.109', type: 'F', parenthesized: false, range: 76, full: [5, 1], reduced: [4, 0], front: 'BTR S06 R01 C04.png', frontSha256: 'b1fab576a05d2077393e8ba958ce69fbe6948f187a5524ffb95c15cfde4acb88', back: 'BTR S06 R01 C04B.png', backSha256: '947e9cd461632f264dd279fa7eefcbbdb400ee43ef9be531072fce69dbadfa20' },
  { entryName: 'Ge Fw-190a 5-2', gpid: 1284, side: 'AXIS', designation: 'Fw-190a', type: 'F', parenthesized: false, range: 71, full: [5, 2], reduced: [4, 1], front: 'BTR S06 R03 C05.png', frontSha256: 'b5f5f1cb4563556cdecd11674dd8d5b34a24edad1e23bac782c05c9950ccb2b8', back: 'BTR S06 R03 C05B.png', backSha256: '2d9b374531e28268613d81427fcd18d67bfeacef59c50a01b6a21d32b45bb075' },
  { entryName: 'Ge Fw-190a 4-2', gpid: 1285, side: 'AXIS', designation: 'Fw-190a', type: 'F', parenthesized: false, range: 71, full: [4, 2], reduced: [3, 1], front: 'BTR S06 R04 C01.png', frontSha256: 'e49c3f4bd98d1eea1d9d24d01ac51a72db57c79a5c6561c27fc43f4c37e43ec2', back: 'BTR S06 R04 C01B.png', backSha256: 'f4530cc73a30175445ea8a5864ec0fdb754803fc7c29d221d8d1a29edd2c2046' },
  { entryName: 'Ge Fw-190d 6-2', gpid: 1286, side: 'AXIS', designation: 'Fw-190d', type: 'F', parenthesized: false, range: 74, full: [6, 2], reduced: [5, 1], front: 'BTR S06 R04 C04.png', frontSha256: '6d43dbf96cf24f724c7d9388ccf099f3c4a52588d62a1dc1bf10d3116a449e46', back: 'BTR S06 R04 C04B.png', backSha256: 'a96c4534549f392039bd28bb4b39ea3f3a4f47961eec9dcb83927785fc659e36' },
  { entryName: 'Ge Fw-190d 5-2', gpid: 1287, side: 'AXIS', designation: 'Fw-190d', type: 'F', parenthesized: false, range: 74, full: [5, 2], reduced: [4, 1], front: 'BTR S06 R04 C07.png', frontSha256: '746430bd42730f5a11570914851bb7534dc33b894db9d8d60b80fcb4ce3b92ec', back: 'BTR S06 R04 C07B.png', backSha256: '5de400407fb1eaea9a190fbce5f580e0711d8b5a952f9a3185c401aad72cfff2' },
  { entryName: 'Ge Fw-190f 4-8', gpid: 1288, side: 'AXIS', designation: 'Fw-190f', type: 'F', parenthesized: false, range: 64, full: [4, 8], reduced: [3, 4], front: 'BTR S06 R04 C09.png', frontSha256: 'caff668e1ff56fdd1c4dcbff04d3c240b3ed7ac422718210465076fe9cc16148', back: 'BTR S06 R04 C09B.png', backSha256: '82f539542ac6d4d1ab4698b0ecf7048fc842252debd24562043c77701cef166c' },
  { entryName: 'Ge Fw-190f 3-7', gpid: 1289, side: 'AXIS', designation: 'Fw-190f', type: 'F', parenthesized: false, range: 64, full: [3, 7], reduced: [2, 4], front: 'BTR S06 R04 C10.png', frontSha256: 'f6ed419a6aa28ab25db82654e46230025be0a9bc17266873158d59daaa2432bd', back: 'BTR S06 R04 C10B.png', backSha256: '1469ec6a464b4003eb6de56b3a1a8fa45623e54158cedd377eb861025cab0360' },
  { entryName: 'Ge Ju.88 (2)-12', gpid: 1292, side: 'AXIS', designation: 'Ju.88', type: 'T', parenthesized: true, range: 106, full: [2, 12], reduced: [1, 6], front: 'BTR S06 R06 C01.png', frontSha256: '9ffe3ecb81240a2b33c085d36b8c2b1df59be1e719c1be9dd97c826c98c12a72', back: 'BTR S06 R06 C01B.png', backSha256: '6c41c7923f9b660d535f9e47ecd93ff25e22a4190d3fed83e555c18cafd3683f' },
  { entryName: 'Ge Ju.88 (2)-9', gpid: 1293, side: 'AXIS', designation: 'Ju.88', type: 'T', parenthesized: true, range: 106, full: [2, 9], reduced: [1, 5], front: 'BTR S06 R06 C02.png', frontSha256: '2378a64507ec77bcd85668d00d17162e3ccb96b1b8b1293c3c268b2cf5041cf1', back: 'BTR S06 R06 C02B.png', backSha256: '9c28ca9062425d16496a301d46338b9ee2622972e26f01a60abd737c9db429da' },
  // Transports (14.9): counters read from the module faces; Air Combat Rating (0) in parentheses, no Barrage Strength.
  { entryName: 'US C-47', gpid: 493, side: 'ALLIED', designation: 'C-47', type: 'TPT', parenthesized: true, range: 229, capacity: [2, 1], full: [0, 0], reduced: [0, 0], front: 'BTR S01 R11 C11.png', frontSha256: '677851604c282bf78829ea5f478b3bac3dc3c7a9918215876f9a203f1d8a43c9', back: 'BTR S01 R11 C11B.png', backSha256: '46351f1761c665a71a36eaad7be34af6e8a0a04b6d948e80da1d544a9b41f974' },
  // Integral glider (14.10f): 2T full / 1T reduced, all carried on the glider.
  { entryName: 'US C-47 + Gldr', gpid: 498, side: 'ALLIED', designation: 'C-47+Gldr', type: 'TPT', parenthesized: true, range: 229, capacity: [4, 2], integralGlider: true, full: [0, 0], reduced: [0, 0], front: 'BTR S01 R12 C11.png', frontSha256: 'c732fc90eb167c29cd2421f7b706211bed1de1242679cbc4c4acd82640382f47', back: 'BTR S01 R12 C11B.png', backSha256: '81c8391cce385c313d668daf043080e08142980443acd49324c5f9548877e34e' },
  { entryName: 'Ge Ju.52', gpid: 1279, side: 'AXIS', designation: 'Ju.52', type: 'TPT', parenthesized: true, range: 62, capacity: [2, 1], full: [0, 0], reduced: [0, 0], front: 'BTR S06 R01 C01.png', frontSha256: '17fa4f172f471854cd8fdfad34ee10d7f936608e22b96dfc1ba41741a4777dd4', back: 'BTR S06 R01 C01B.png', backSha256: '18d26d48073a073c03dcb78f32d9a8b2ce35da062a67d11b4f94dbbb5cf71076' },
]);

/** Air Base counter (`Airbase` PieceSlot, Level 1-3 faces). */
export const AIR_BASE_COUNTER = {
  entryName: 'Airbase',
  gpid: 21,
  images: ['Airbase-Strength-1 new.png', 'Airbase-Strength-2  new.png', 'Airbase-Strength-3 new.png'],
} as const;
