import { hash3D, hashToReal, randomize } from "./Random.js";
// Returns a 64 x 64 array of noise values between 1 and 100
export function randomOctaveNoise(xStart, yStart) {
    const octaveSizes = [32, 16, 8, 4];
    // For each octave, get the noise array
    const noiseArrays = octaveSizes.map((octaveSize) => getNoiseForSingleOctave(octaveSize, xStart, yStart));
    const outputNoise = new Array(64).fill(0).map(() => new Array(64).fill(0));
    for (let x = 0; x < 64; x++) {
        for (let y = 0; y < 64; y++) {
            // Sum the noise arrays for this x,y coordinate
            let sumNoise = 0;
            let multiplier = 0.5;
            for (let i = 0; i < octaveSizes.length; i++) {
                sumNoise += noiseArrays[i][x][y] * multiplier;
                multiplier *= 0.5;
            }
            outputNoise[x][y] = Math.floor(sumNoise * 106.66);
        }
    }
    return outputNoise;
}
// Returns the noise array for a single octave
// Octave size should be a power of 2, from 1 to 8.
function getNoiseForSingleOctave(octaveSize, xStart, yStart) {
    // We want to end up with a 64 x 64 array of noise values between 1 and 100
    // However! For the power of linear interpolation, we need an extra edge around the outside of the array.
    // So we add octavesize * 2 to the size of the array.
    let startSize = (64 / octaveSize) + 2;
    let noise = new Array(startSize).fill(0).map(() => new Array(startSize).fill(0));
    for (let x = 0; x < startSize; x += 1) {
        for (let y = 0; y < startSize; y += 1) {
            // Populate the square of octaveSize, octaveSize with this hash
            noise[x][y] = hashToReal(randomize("octave" + octaveSize.toString(), hash3D(xStart + (x * octaveSize) - octaveSize, yStart + (y * octaveSize) - octaveSize, octaveSize)));
        }
    }
    let doubles = 0;
    while (noise.length <= 64) {
        noise = upSampleNoise(noise);
        doubles++;
    }
    let offsetMultiple = Math.pow(2, doubles);
    // Crop the noise array to the original size
    const outputNoise = new Array(64).fill(0).map(() => new Array(64).fill(0));
    for (let x = offsetMultiple; x < 64 + offsetMultiple; x++) {
        for (let y = offsetMultiple; y < 64 + offsetMultiple; y++) {
            outputNoise[x - offsetMultiple][y - offsetMultiple] = noise[x][y];
        }
    }
    // console.log(`chunk ${xStart},${yStart} col 0:`, outputNoise[0].slice(0, 5));
    // console.log(`chunk ${xStart},${yStart} col 63:`, outputNoise[63].slice(0, 5));
    return outputNoise;
}
function upSampleNoise(noise) {
    const oldSize = noise.length;
    const newSize = oldSize * 2;
    const newNoise = new Array(newSize).fill(0).map(() => new Array(newSize).fill(0));
    for (let x = 0; x < newSize; x++) {
        for (let y = 0; y < newSize; y++) {
            const x0 = Math.floor(x / 2);
            const y0 = Math.floor(y / 2);
            const x1 = Math.min(x0 + 1, oldSize - 1);
            const y1 = Math.min(y0 + 1, oldSize - 1);
            const horizontalWeight = (x - x0 * 2) / 2;
            const verticalWeight = (y - y0 * 2) / 2;
            let topValue = lerp(noise[x0][y0], noise[x1][y0], horizontalWeight);
            let bottomValue = lerp(noise[x0][y1], noise[x1][y1], horizontalWeight);
            newNoise[x][y] = lerp(topValue, bottomValue, verticalWeight);
        }
    }
    return newNoise;
}
function lerp(a, b, t) {
    return a + t * (b - a);
}
//# sourceMappingURL=RandomOctave.js.map