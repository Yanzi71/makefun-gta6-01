// Tunable constants for Solmar: city layout, movement, cars, police and scoring.
// One file holds every magic number so balancing never means hunting through systems.

export const WORLD = {
  /** Playable half-extent; the world is clamped to [-half, half] on x and z. */
  half: 168,
  /** Street centre lines, both directions. */
  streets: [-138, -92, -46, 0, 46, 92, 138],
  roadWidth: 12,
  blockSize: 34,
  /** Block centres (midpoints between neighbouring streets). */
  blocks: [-115, -69, -23, 23, 69, 115],
  /** The park takes the block at blocks[2] x blocks[2]. */
  parkBlock: 2,
  /** Water starts past this x; the beach runs from beachStart to waterStart. */
  beachStart: 156,
  waterStart: 172,
};

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  radius: 0.6,
  height: 1.8,
  jumpSpeed: 7.5,
  gravity: 22,
  maxHealth: 100,
  /** Health regained per second after 10 s without damage. */
  regenPerSecond: 3,
  /** How close a car must be to steal it with E. */
  enterRange: 3.4,
  punchRange: 2.4,
  punchDamage: 34,
  pistolDamage: 45,
  pistolRange: 90,
  /** Seconds between pistol shots. */
  pistolCooldown: 0.28,
};

export const CAR = {
  maxSpeed: 38,
  reverseMax: 12,
  accel: 24,
  brake: 34,
  drag: 0.55,
  /** Steering rate at low speed, radians per second. */
  turnRate: 2.1,
  /** Steering gets lazier as speed rises. */
  turnFalloff: 0.55,
  handbrakeDrag: 2.4,
  radius: 2.1,
  maxHealth: 100,
  /** Damage taken per unit of impact speed over the threshold. */
  crashDamage: 2.2,
};

export const TRAFFIC = {
  count: 14,
  speedMin: 7,
  speedMax: 12,
  /** Chance a traffic car turns at an intersection instead of going straight. */
  turnChance: 0.35,
};

export const PEDS = {
  count: 20,
  walkMin: 1.2,
  walkMax: 2.0,
  fleeSpeed: 5.5,
};

export const POLICE = {
  /** Seconds a crime stays "hot": no decay while a cop is near or a crime is fresh. */
  heatSeconds: 12,
  /** Seconds of calm needed to lose one star. */
  decaySeconds: 10,
  /** Chase speed cap, slightly above the player's top speed at high stars. */
  chaseSpeed: 40,
  /** Seconds a cop must stand next to a slow player to bust them. */
  bustSeconds: 3,
  bustRange: 3.2,
  /** On-foot cops only join the hunt at this many stars. */
  footCopsAtStars: 3,
  /** How far away police cars spawn from the player. */
  spawnDistance: 55,
};

export const MONEY = {
  start: 500,
  bustedFine: 150,
  wastedFine: 100,
};

export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0x9fd0e8,
  sun: 0xfff2d8,
  ground: 0x8a9a7b,
  road: 0x3a3f44,
  sidewalk: 0xb9b3a4,
  beach: 0xe8d9a0,
  water: 0x2e7fa8,
  park: 0x5d8a4a,
};
