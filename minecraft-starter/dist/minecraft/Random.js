export const globalSeed = 1234;
export function generateHashForSeed(seed) {
    let hash = 0;
    for (const char of seed) {
        hash = (hash << 5) - hash + char.charCodeAt(0);
        hash |= 0; // Constrain to 32bit integer
    }
    return hash;
}
;
// Takes three 32-bit integers x, y, z; returns a 32-bit integer.
export function hash3D(x, y, z) {
    let h = x * 374761393 + y * 668265263 + z * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return h;
}
// Parameters: 
// purpose: a unique magic string for the application
// h: runtime data consolidated into a 32-bit integer
// Returns a 32-bit integer that depends only on the global seed,
//      purpose, and h.
export function randomize(purpose, h) {
    return hash3D(globalSeed, generateHashForSeed(purpose), h);
}
// Convert a 32-bit hash into a number in [0, 1).
export function hashToReal(h) {
    return (h >>> 0) / 4294967296;
}
//# sourceMappingURL=Random.js.map