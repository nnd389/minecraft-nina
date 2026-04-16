import { globalSeed, generateHashForSeed } from "./Random.js"

// Will did Perlin noise in Raytracer, then had AI port it to JS for p2, and copied it here, though we made some changes to it.
const perlinGradients: [number, number, number][] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
  [1, 1, 0],
  [-1, 1, 0],
  [0, -1, 1],
  [0, -1, -1],
];

const MOD = 256.0;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function hash(x: number, y: number, z: number, noiseArray: Array<number>): number {
  return (
    noiseArray[
      (x + noiseArray[(y + noiseArray[z & 255]) & 255]) & 255
    ] & 15
  );
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function perlinNoise(x: number, y: number, z: number, seed: string): number {
  const permutation = getPermutation(seed);
  x = mod(x, MOD);
  y = mod(y, MOD);
  z = mod(z, MOD);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);

  const xf = x - x0;
  const yf = y - y0;
  const zf = z - z0;

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const dots = new Array(2)
    .fill(0)
    .map(() => new Array(2).fill(0).map(() => new Array(2).fill(0)));

  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= 1; j++) {
      for (let k = 0; k <= 1; k++) {
        const g = perlinGradients[hash(x0 + i, y0 + j, z0 + k, permutation)];
        const dx = xf - i;
        const dy = yf - j;
        const dz = zf - k;
        dots[i][j][k] = g[0] * dx + g[1] * dy + g[2] * dz;
      }
    }
  }

  const x00 = lerp(dots[0][0][0], dots[1][0][0], u);
  const x01 = lerp(dots[0][0][1], dots[1][0][1], u);
  const x10 = lerp(dots[0][1][0], dots[1][1][0], u);
  const x11 = lerp(dots[0][1][1], dots[1][1][1], u);

  const y0v = lerp(x00, x10, v);
  const y1v = lerp(x01, x11, v);

  return lerp(y0v, y1v, w);
}


// Will used AI to find a clean way to turn a seed into a permutation
function makeRng(seedA: number, seedB: number): () => number {
  // Mix the two seeds into a single 32-bit state
  let s = (seedA ^ Math.imul(seedB ^ (seedB >>> 16), 0x85ebca6b)) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPermutationFromSeed(seed: number): number[] {
  const p = Array.from({ length: 256 }, (_, i) => i);
  const rand = makeRng(seed, globalSeed);
  // Fisher–Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p.concat(p); // duplicate to 512 so hash() never overflows
}

// Cache the permutations, so we don't have to build them every time
const permutations = new Map<number, number[]>();
function getPermutation(seed: string): number[] {
  // Hash the seed to a number

  const seedNumber = generateHashForSeed(seed);

  if (!permutations.has(seedNumber)) {
    permutations.set(seedNumber, buildPermutationFromSeed(seedNumber));
  }
  return permutations.get(seedNumber)!;
}