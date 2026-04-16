import { Vec3 } from "../lib/TSM.js";
import { hash3D, hashToReal, randomize } from "./Random.js";
import { Mob, mobDensities } from "./Mob.js";
import { validBiomes, volcanoBiome, desertBiome, tundraBiome, plainsBiome, oceanBiome } from "./Biome.js";
import { cubeTypeEnum, typeToColor } from "./Cube.js";
import { perlinNoise } from "./Perlin.js";
import { randomOctaveNoise } from "./RandomOctave.js";
const cubeTypeSeed = "cubetype";
const biomeSeed = "biome";
// lake generation seeds
const lakeMaskSeed = "lake_mask";
const lakeShapeSeed = "lake_shape";
const lakeDepthSeed = "lake_depth";
const lakeFillSeed = "lake_fill";
const lakeTypeSeed = "lake_type";
const lakeEdgeTieSeed = "lake_edge_tie";
const BIOME_SCALE = 0.2;
const LAKE_MAX_ELEVATION = 70;
const WATERFALL_MIN_ELEVATION = 75;
const LAVA_MAX_ELEVATION = 56;
const LIQUID_REGION_SIZE = 8;
const BASIN_WALL_MARGIN = 1;
const MAX_BREACH_FRACTION = 0.10;
const TARGET_WATER_RATIO_MIN = 0.012;
const BACKFILL_MAX_PASSES = 3;
const BACKFILL_THRESHOLD_DELTA = 0.05;
const BACKFILL_SLOPE_DELTA = 1;
const WATERFALL_SPAWN_CHANCE = 0.003;
const MIN_WATER_COMPONENT_SIZE = 10;
const MIN_LAVA_COMPONENT_SIZE = 5;
export class Chunk {
    constructor(centerX, centerZ, size) {
        this.x = centerX;
        this.z = centerZ;
        this.size = size;
        this.minSurfaceLevel = 40;
        this.cubes = 0;
        this.cubePositionsF32 = new Float32Array(0);
        this.cubeColorsF32 = new Float32Array(0);
        this.cubeTypes = [];
        this.cubeTypesF32 = new Float32Array(0);
        this.mobs = [];
        this.blockTypesByWorld = new Map();
        this.surfaceHeights = this.createZeroField();
        this.liquidCells = [];
        this.terrainSnapshot = null;
        this.generateCubes();
    }
    generateCubes() {
        const topLeftX = this.x - this.size / 2;
        const topLeftZ = this.z - this.size / 2;
        this.biomeField = this.buildBiomeField(topLeftX, topLeftZ);
        this.baseHeightField = this.buildHeightField(topLeftX, topLeftZ, this.biomeField);
        this.lakeField = this.buildLakeField(topLeftX, topLeftZ, this.baseHeightField, this.biomeField);
        const columnPlans = this.buildColumnPlans(this.baseHeightField, this.lakeField);
        this.populateCanonicalBlocks(topLeftX, topLeftZ, this.biomeField, columnPlans);
        this.generateMobs(topLeftX, topLeftZ, columnPlans);
        this.emitRenderBuffers();
        this.terrainSnapshot = null;
    }
    // ---- Height & Biome Fields ----
    buildHeightField(topLeftX, topLeftZ, biomeField) {
        if (this.size !== 64) {
            throw new Error(`Chunk currently expects size 64, received ${this.size}.`);
        }
        // Blend heightScaler
        const scalerSmoothRadius = 3;
        const smoothedHeightScalers = this.createZeroField();
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                let sum = 0;
                let weight = 0;
                for (let dx = -scalerSmoothRadius; dx <= scalerSmoothRadius; dx++) {
                    for (let dz = -scalerSmoothRadius; dz <= scalerSmoothRadius; dz++) {
                        const nx = localX + dx;
                        const nz = localZ + dz;
                        if (nx >= 0 && nx < this.size && nz >= 0 && nz < this.size) {
                            const w = 1 / (1 + dx * dx + dz * dz);
                            sum += biomeField[nx][nz].heightScaler * w;
                            weight += w;
                        }
                    }
                }
                smoothedHeightScalers[localX][localZ] = sum / weight;
            }
        }
        const noise = randomOctaveNoise(topLeftX, topLeftZ);
        const heights = this.createZeroField();
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const noiseHeight = noise[localX][localZ];
                const scaledHeight = (noiseHeight / 100.0 * (100 - this.minSurfaceLevel) + this.minSurfaceLevel) * smoothedHeightScalers[localX][localZ];
                heights[localX][localZ] = Math.floor(scaledHeight);
            }
        }
        const smoothed = this.createZeroField();
        const smoothRadius = 3;
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                let sum = 0;
                let weight = 0;
                for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
                    for (let dz = -smoothRadius; dz <= smoothRadius; dz++) {
                        const nx = localX + dx;
                        const nz = localZ + dz;
                        const w = 1 / (1 + dx * dx + dz * dz);
                        if (nx >= 0 && nx < this.size && nz >= 0 && nz < this.size) {
                            sum += heights[nx][nz] * w;
                            weight += w;
                        }
                    }
                }
                smoothed[localX][localZ] = Math.floor(sum / weight);
            }
        }
        return smoothed;
    }
    buildBiomeField(topLeftX, topLeftZ) {
        const biomeField = new Array(this.size)
            .fill(null)
            .map(() => new Array(this.size).fill(validBiomes[0][0]));
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biomeTypeNoiseValue = perlinNoise(worldX * BIOME_SCALE / this.size, worldZ * BIOME_SCALE / this.size, 0, biomeSeed);
                const biomeTypeNoiseNorm = (biomeTypeNoiseValue + 1.0) / 2.0;
                biomeField[localX][localZ] = this.pickBiome(biomeTypeNoiseNorm);
            }
        }
        return biomeField;
    }
    // ---- Lake Generation Pipeline ----
    buildLakeField(topLeftX, topLeftZ, baseHeights, biomeField) {
        let lakeField = this.generateLakeCandidates(topLeftX, topLeftZ, baseHeights, biomeField, 0, 0);
        lakeField = this.refineLakeConnectivity(lakeField);
        lakeField = this.validateBasinContainment(lakeField, baseHeights);
        const targetCoverage = this.computeTargetCoverage(biomeField);
        for (let pass = 0; pass < BACKFILL_MAX_PASSES; pass++) {
            if (this.computeWaterCoverage(lakeField) >= targetCoverage)
                break;
            const thresholdDelta = (pass + 1) * BACKFILL_THRESHOLD_DELTA;
            const slopeDelta = (pass + 1) * BACKFILL_SLOPE_DELTA;
            lakeField = this.backfillLakeCandidates(lakeField, topLeftX, topLeftZ, baseHeights, biomeField, thresholdDelta, slopeDelta);
            lakeField = this.refineLakeConnectivity(lakeField);
            lakeField = this.validateBasinContainment(lakeField, baseHeights);
        }
        lakeField = this.addWaterfallSources(lakeField, topLeftX, topLeftZ, baseHeights);
        return lakeField;
    }
    generateLakeCandidates(topLeftX, topLeftZ, baseHeights, biomeField, thresholdDelta, slopeDelta) {
        const lakeField = this.createEmptyLakeField(baseHeights);
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biome = biomeField[localX][localZ];
                const originalSurface = baseHeights[localX][localZ];
                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);
                const candidate = this.evaluateLakeCell(worldX, worldZ, originalSurface, localSlope, biome, thresholdDelta, slopeDelta);
                if (candidate !== null) {
                    lakeField[localX][localZ] = candidate;
                }
            }
        }
        return lakeField;
    }
    evaluateLakeCell(worldX, worldZ, originalSurface, localSlope, biome, thresholdDelta, slopeDelta) {
        const featureClass = this.classifyStaticLiquidFeature(originalSurface, biome);
        if (featureClass === 'none')
            return null;
        const profile = this.getLakeBiomeProfile(biome);
        const adjustedThreshold = Math.max(0.1, profile.threshold - thresholdDelta);
        const adjustedMaxSlope = profile.maxSlope + slopeDelta;
        const mask = this.sampleLakeMask(worldX, worldZ, adjustedThreshold);
        if (localSlope > adjustedMaxSlope || mask <= 0)
            return null;
        if (mask < 0.24) {
            const edgeRoll = hashToReal(randomize(lakeEdgeTieSeed, hash3D(worldX, 0, worldZ)));
            if (edgeRoll > mask)
                return null;
        }
        const depthNoise = this.normalizedPerlin(worldX * 0.095, worldZ * 0.095, lakeDepthSeed);
        const basinDepth = this.clamp(Math.floor(1 + (mask * 0.75 + depthNoise * 0.25) * profile.maxDepth), 1, profile.maxDepth);
        const carvedSurface = Math.max(4, originalSurface - basinDepth);
        const fillNoise = this.normalizedPerlin(worldX * 0.07, worldZ * 0.07, lakeFillSeed);
        const fillSpan = Math.max(1, Math.floor(basinDepth * profile.fillRatio + fillNoise * 2.0));
        const fillHeight = Math.min(originalSurface - 1, carvedSurface + fillSpan);
        if (fillHeight <= carvedSurface)
            return null;
        const liquidType = this.getRegionLiquidType(worldX, worldZ, featureClass, biome, originalSurface);
        return {
            isLake: true,
            originalSurface,
            carvedSurface,
            fillHeight,
            liquidType,
        };
    }
    backfillLakeCandidates(lakeField, topLeftX, topLeftZ, baseHeights, biomeField, thresholdDelta, slopeDelta) {
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake)
                    continue;
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biome = biomeField[localX][localZ];
                const originalSurface = baseHeights[localX][localZ];
                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);
                const candidate = this.evaluateLakeCell(worldX, worldZ, originalSurface, localSlope, biome, thresholdDelta, slopeDelta);
                if (candidate !== null) {
                    lakeField[localX][localZ] = candidate;
                }
            }
        }
        return lakeField;
    }
    refineLakeConnectivity(lakeField) {
        const visited = new Array(this.size).fill(null).map(() => new Array(this.size).fill(false));
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const componentCells = [];
        const floodFill = (startX, startZ, liquidType) => {
            const queue = [[startX, startZ]];
            visited[startX][startZ] = true;
            while (queue.length > 0) {
                const [x, z] = queue.shift();
                componentCells.push([x, z]);
                for (const [dx, dz] of offsets) {
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || visited[nx][nz])
                        continue;
                    const nextCell = lakeField[nx][nz];
                    if (!nextCell.isLake || nextCell.liquidType !== liquidType)
                        continue;
                    visited[nx][nz] = true;
                    queue.push([nx, nz]);
                }
            }
        };
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (visited[localX][localZ])
                    continue;
                const seedCell = lakeField[localX][localZ];
                if (!seedCell.isLake || seedCell.liquidType === null)
                    continue;
                componentCells.length = 0;
                floodFill(localX, localZ, seedCell.liquidType);
                const minSize = seedCell.liquidType === cubeTypeEnum.WATER
                    ? MIN_WATER_COMPONENT_SIZE
                    : MIN_LAVA_COMPONENT_SIZE;
                if (componentCells.length < minSize) {
                    for (const [x, z] of componentCells) {
                        this.resetLakeCell(lakeField, x, z);
                    }
                    continue;
                }
                const fillLevels = componentCells
                    .map(([x, z]) => lakeField[x][z].fillHeight)
                    .sort((a, b) => a - b);
                const sharedFillHeight = fillLevels[Math.floor(fillLevels.length * 0.4)];
                for (const [x, z] of componentCells) {
                    const cell = lakeField[x][z];
                    const cappedFill = this.clamp(sharedFillHeight, cell.carvedSurface + 1, cell.originalSurface - 1);
                    if (cappedFill <= cell.carvedSurface) {
                        this.resetLakeCell(lakeField, x, z);
                        continue;
                    }
                    cell.fillHeight = cappedFill;
                }
            }
        }
        return lakeField;
    }
    validateBasinContainment(lakeField, baseHeights) {
        const visited = new Array(this.size).fill(null).map(() => new Array(this.size).fill(false));
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const componentCells = [];
        const floodFill = (startX, startZ, liquidType) => {
            const queue = [[startX, startZ]];
            visited[startX][startZ] = true;
            while (queue.length > 0) {
                const [x, z] = queue.shift();
                componentCells.push([x, z]);
                for (const [dx, dz] of offsets) {
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || visited[nx][nz])
                        continue;
                    const nextCell = lakeField[nx][nz];
                    if (!nextCell.isLake || nextCell.liquidType !== liquidType)
                        continue;
                    visited[nx][nz] = true;
                    queue.push([nx, nz]);
                }
            }
        };
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (visited[localX][localZ])
                    continue;
                const seedCell = lakeField[localX][localZ];
                if (!seedCell.isLake || seedCell.liquidType === null)
                    continue;
                componentCells.length = 0;
                floodFill(localX, localZ, seedCell.liquidType);
                const waterline = lakeField[componentCells[0][0]][componentCells[0][1]].fillHeight;
                const componentSet = new Set(componentCells.map(([x, z]) => `${x},${z}`));
                const perimeterSeen = new Set();
                let perimeterTotal = 0;
                let perimeterBreach = 0;
                for (const [x, z] of componentCells) {
                    for (const [dx, dz] of offsets) {
                        const nx = x + dx;
                        const nz = z + dz;
                        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size)
                            continue;
                        const key = `${nx},${nz}`;
                        if (componentSet.has(key) || perimeterSeen.has(key))
                            continue;
                        perimeterSeen.add(key);
                        perimeterTotal++;
                        if (baseHeights[nx][nz] < waterline + BASIN_WALL_MARGIN) {
                            perimeterBreach++;
                        }
                    }
                }
                if (perimeterTotal > 0 && perimeterBreach / perimeterTotal > MAX_BREACH_FRACTION) {
                    for (const [x, z] of componentCells) {
                        this.resetLakeCell(lakeField, x, z);
                    }
                }
            }
        }
        return lakeField;
    }
    addWaterfallSources(lakeField, topLeftX, topLeftZ, baseHeights) {
        const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake)
                    continue;
                const originalSurface = baseHeights[localX][localZ];
                if (originalSurface < WATERFALL_MIN_ELEVATION)
                    continue;
                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);
                if (localSlope < 3)
                    continue;
                let hasDownhill = false;
                for (const [dx, dz] of offsets) {
                    const nx = localX + dx;
                    const nz = localZ + dz;
                    if (nx >= 0 && nz >= 0 && nx < this.size && nz < this.size) {
                        if (baseHeights[nx][nz] < originalSurface - 1) {
                            hasDownhill = true;
                            break;
                        }
                    }
                }
                if (!hasDownhill)
                    continue;
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const waterfallRoll = hashToReal(randomize("WATERFALL", hash3D(worldX, originalSurface, worldZ)));
                if (waterfallRoll > WATERFALL_SPAWN_CHANCE)
                    continue;
                const carvedSurface = originalSurface - 1;
                lakeField[localX][localZ] = {
                    isLake: true,
                    originalSurface,
                    carvedSurface,
                    fillHeight: carvedSurface + 1,
                    liquidType: cubeTypeEnum.WATER,
                };
            }
        }
        return lakeField;
    }
    // ---- Coverage helpers ----
    computeWaterCoverage(lakeField) {
        let count = 0;
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake)
                    count++;
            }
        }
        return count;
    }
    computeTargetCoverage(biomeField) {
        let totalMultiplier = 0;
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                totalMultiplier += this.getLakeBiomeProfile(biomeField[localX][localZ]).densityMultiplier;
            }
        }
        const avgMultiplier = totalMultiplier / (this.size * this.size);
        return Math.floor(TARGET_WATER_RATIO_MIN * avgMultiplier * this.size * this.size);
    }
    // ---- Lake field utilities ----
    createEmptyLakeField(baseHeights) {
        return new Array(this.size).fill(null).map((_, localX) => new Array(this.size).fill(null).map((_, localZ) => ({
            isLake: false,
            originalSurface: baseHeights[localX][localZ],
            carvedSurface: baseHeights[localX][localZ],
            fillHeight: baseHeights[localX][localZ],
            liquidType: null,
        })));
    }
    resetLakeCell(lakeField, x, z) {
        const surface = lakeField[x][z].originalSurface;
        lakeField[x][z] = {
            isLake: false,
            originalSurface: surface,
            carvedSurface: surface,
            fillHeight: surface,
            liquidType: null,
        };
    }
    // ---- Column Plans ----
    buildColumnPlans(baseHeights, lakeField) {
        const plans = new Array(this.size)
            .fill(null)
            .map(() => new Array(this.size).fill(null).map(() => ({
            surface: 0,
            floor: 0,
            fillHeight: 0,
            isLake: false,
            liquidType: null,
        })));
        const carvedHeights = this.createZeroField();
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const lakeCell = lakeField[localX][localZ];
                carvedHeights[localX][localZ] = lakeCell.isLake
                    ? lakeCell.carvedSurface
                    : baseHeights[localX][localZ];
            }
        }
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const surface = carvedHeights[localX][localZ];
                const floor = this.computeColumnFloor(carvedHeights, localX, localZ);
                const lakeCell = lakeField[localX][localZ];
                plans[localX][localZ] = {
                    surface,
                    floor,
                    fillHeight: lakeCell.fillHeight,
                    isLake: lakeCell.isLake,
                    liquidType: lakeCell.liquidType,
                };
            }
        }
        this.surfaceHeights = carvedHeights;
        return plans;
    }
    // ---- Block Population ----
    populateCanonicalBlocks(topLeftX, topLeftZ, biomeField, columnPlans) {
        this.blockTypesByWorld.clear();
        this.liquidCells = [];
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biome = biomeField[localX][localZ];
                const plan = columnPlans[localX][localZ];
                for (let y = plan.surface; y >= plan.floor; y--) {
                    const cubeType = this.getColumnCubeType(worldX, worldZ, y, plan.surface, biome);
                    this.setBlock(worldX, y, worldZ, cubeType);
                }
                if (plan.isLake && plan.liquidType !== null) {
                    for (let y = plan.surface + 1; y <= plan.fillHeight; y++) {
                        this.setBlock(worldX, y, worldZ, plan.liquidType);
                        this.liquidCells.push({
                            worldX,
                            worldY: y,
                            worldZ,
                            type: plan.liquidType,
                        });
                    }
                }
            }
        }
    }
    // ---- Mob Generation ----
    generateMobs(topLeftX, topLeftZ, columnPlans) {
        this.mobs = [];
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const plan = columnPlans[localX][localZ];
                if (plan.isLake)
                    continue;
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const spawnY = plan.surface + 1;
                const pointHash = hash3D(worldX, spawnY, worldZ);
                const typeRoll = hashToReal(randomize("MOBTYPE", pointHash));
                const orientationRoll = hashToReal(randomize("MOBROT", pointHash));
                let cumulativeDensity = 0;
                let selectedType = null;
                for (const [mobType, density] of mobDensities) {
                    cumulativeDensity += density;
                    if (typeRoll <= cumulativeDensity) {
                        selectedType = mobType;
                        break;
                    }
                }
                if (selectedType === null)
                    continue;
                this.mobs.push(new Mob(selectedType, new Vec3([worldX, spawnY, worldZ]), orientationRoll * 2 * Math.PI));
                //this.drawMesh(this.wolfMesh, positions, rotations);
            }
        }
        // console.log("mobs are: ", this.mobs)
        //this.drawMesh(this.wolfMesh, positions, rotations);
    }
    // ---- Render Buffers ----
    emitRenderBuffers() {
        const cubePositions = [];
        const cubeColors = [];
        this.cubeTypes = [];
        for (const [key, cubeType] of this.blockTypesByWorld.entries()) {
            const [worldX, worldY, worldZ] = this.parseBlockKey(key);
            cubePositions.push(worldX, worldY, worldZ, 0);
            const cubeColor = typeToColor[cubeType.valueOf()];
            cubeColors.push(cubeColor.x, cubeColor.y, cubeColor.z);
            this.cubeTypes.push(cubeType);
        }
        this.cubes = cubePositions.length / 4;
        this.cubePositionsF32 = new Float32Array(cubePositions);
        this.cubeColorsF32 = new Float32Array(cubeColors);
        this.cubeTypesF32 = new Float32Array(this.cubeTypes.map(t => t.valueOf()));
    }
    // ---- Classification & Profiles ----
    getColumnCubeType(worldX, worldZ, y, surface, biome) {
        const cubeTypeNoiseValue = perlinNoise(worldX / this.size, worldZ / this.size, y / 100.0, cubeTypeSeed);
        const cubeTypeNoiseNorm = (cubeTypeNoiseValue + 1.0) / 2.0;
        return biome.getCubeType(cubeTypeNoiseNorm, y, surface);
    }
    pickBiome(normNoise) {
        let cumulative = 0;
        let selected = validBiomes[0][0];
        for (const [biome, probability] of validBiomes) {
            selected = biome;
            cumulative += probability;
            if (normNoise <= cumulative)
                break;
        }
        return selected;
    }
    classifyStaticLiquidFeature(surface, biome) {
        if (biome === volcanoBiome && surface <= LAVA_MAX_ELEVATION) {
            return 'volcanic_pool';
        }
        if (surface <= LAKE_MAX_ELEVATION) {
            return 'lowland_lake';
        }
        return 'none';
    }
    getRegionLiquidType(worldX, worldZ, featureClass, biome, surface) {
        if (featureClass !== 'volcanic_pool') {
            return cubeTypeEnum.WATER;
        }
        const regionX = Math.floor(worldX / LIQUID_REGION_SIZE);
        const regionZ = Math.floor(worldZ / LIQUID_REGION_SIZE);
        const regionHash = hash3D(regionX, 0, regionZ);
        const regionRoll = hashToReal(randomize(lakeTypeSeed, regionHash));
        const profile = this.getLakeBiomeProfile(biome);
        // Keep lava rare overall, but bias it upward at lower elevations in volcanic areas
        // so lava appears occasionally in practice.
        const depthBonus = this.clamp((LAVA_MAX_ELEVATION - surface) / 24, 0, 0.12);
        const lavaChance = this.clamp(profile.lavaChance + depthBonus, 0, 0.35);
        return regionRoll < lavaChance ? cubeTypeEnum.LAVA : cubeTypeEnum.WATER;
    }
    getLakeBiomeProfile(biome) {
        if (biome === volcanoBiome) {
            return { threshold: 0.57, maxDepth: 9, fillRatio: 0.75, maxSlope: 7, lavaChance: 0.2, densityMultiplier: 0.6 };
        }
        if (biome === oceanBiome) {
            return { threshold: 0.46, maxDepth: 5, fillRatio: 0.9, maxSlope: 8, lavaChance: 0.0, densityMultiplier: 1.5 };
        }
        if (biome === desertBiome) {
            return { threshold: 0.69, maxDepth: 6, fillRatio: 0.63, maxSlope: 6, lavaChance: 0.0, densityMultiplier: 0.4 };
        }
        if (biome === tundraBiome) {
            return { threshold: 0.64, maxDepth: 5, fillRatio: 0.72, maxSlope: 6, lavaChance: 0.0, densityMultiplier: 0.9 };
        }
        if (biome === plainsBiome) {
            return { threshold: 0.62, maxDepth: 6, fillRatio: 0.7, maxSlope: 6, lavaChance: 0.0, densityMultiplier: 1.0 };
        }
        return { threshold: 0.63, maxDepth: 6, fillRatio: 0.7, maxSlope: 6, lavaChance: 0.0, densityMultiplier: 0.8 };
    }
    // ---- Noise & Mask Helpers ----
    sampleLakeMask(worldX, worldZ, threshold) {
        const macroNoise = this.normalizedPerlin(worldX * 0.012, worldZ * 0.012, lakeMaskSeed);
        const shapeNoise = this.normalizedPerlin(worldX * 0.045, worldZ * 0.045, lakeShapeSeed);
        const macroMask = this.smoothstep(threshold, Math.min(0.98, threshold + 0.22), macroNoise);
        const shorelineMask = this.smoothstep(0.38, 0.9, shapeNoise);
        return this.clamp(macroMask * shorelineMask, 0.0, 1.0);
    }
    computeLocalSlope(heightField, localX, localZ) {
        const center = heightField[localX][localZ];
        const neighbors = [
            this.getFieldValue(heightField, localX - 1, localZ, center),
            this.getFieldValue(heightField, localX + 1, localZ, center),
            this.getFieldValue(heightField, localX, localZ - 1, center),
            this.getFieldValue(heightField, localX, localZ + 1, center),
        ];
        return Math.max(...neighbors.map((n) => Math.abs(n - center)));
    }
    computeColumnFloor(surfaceHeights, localX, localZ) {
        const n1 = this.getFieldValue(surfaceHeights, localX - 1, localZ, 0);
        const n2 = this.getFieldValue(surfaceHeights, localX + 1, localZ, 0);
        const n3 = this.getFieldValue(surfaceHeights, localX, localZ - 1, 0);
        const n4 = this.getFieldValue(surfaceHeights, localX, localZ + 1, 0);
        const minNeighbor = Math.min(n1, n2, n3, n4);
        return Math.max(0, Math.floor(Math.max(minNeighbor - 1, 0)));
    }
    // ---- Generic Utilities ----
    getFieldValue(field, x, z, fallback) {
        if (x < 0 || z < 0 || x >= this.size || z >= this.size)
            return fallback;
        return field[x][z];
    }
    normalizedPerlin(x, z, seed) {
        return (perlinNoise(x, z, 0, seed) + 1.0) / 2.0;
    }
    smoothstep(edge0, edge1, x) {
        if (edge0 === edge1)
            return x < edge0 ? 0 : 1;
        const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    setBlock(worldX, worldY, worldZ, cubeType) {
        this.blockTypesByWorld.set(this.blockKey(worldX, worldY, worldZ), cubeType);
    }
    blockKey(worldX, worldY, worldZ) {
        return `${worldX}|${worldY}|${worldZ}`;
    }
    parseBlockKey(key) {
        const [x, y, z] = key.split("|").map((value) => Number.parseInt(value, 10));
        return [x, y, z];
    }
    createZeroField() {
        return new Array(this.size).fill(null).map(() => new Array(this.size).fill(0));
    }
    // ---- Snapshot ----
    buildTerrainSnapshot() {
        const blocks = [];
        for (const [key, cubeType] of this.blockTypesByWorld.entries()) {
            const [worldX, worldY, worldZ] = this.parseBlockKey(key);
            blocks.push({ worldX, worldY, worldZ, type: cubeType });
        }
        return {
            chunkCenterX: this.x,
            chunkCenterZ: this.z,
            size: this.size,
            minSurfaceLevel: this.minSurfaceLevel,
            surfaceHeights: this.surfaceHeights.map((row) => row.slice()),
            blocks,
            liquidCells: this.liquidCells.map((cell) => (Object.assign({}, cell))),
        };
    }
    getTerrainSnapshot() {
        if (this.terrainSnapshot === null) {
            this.terrainSnapshot = this.buildTerrainSnapshot();
        }
        return Object.assign(Object.assign({}, this.terrainSnapshot), { surfaceHeights: this.terrainSnapshot.surfaceHeights.map((row) => row.slice()), blocks: this.terrainSnapshot.blocks.map((block) => (Object.assign({}, block))), liquidCells: this.terrainSnapshot.liquidCells.map((cell) => (Object.assign({}, cell))) });
    }
    getInitialLiquidCells() {
        return this.getTerrainSnapshot().liquidCells;
    }
    cubePositions() {
        return this.cubePositionsF32;
    }
    numCubes() {
        return this.cubes;
    }
    cubeColors() {
        return this.cubeColorsF32;
    }
    getMobs() {
        return this.mobs;
    }
    isColliding(x, y, z, radius = 0.4, height = 2) {
        for (let i = 0; i < this.cubes; i++) {
            const cx = this.cubePositionsF32[i * 4];
            const cy = this.cubePositionsF32[i * 4 + 1];
            const cz = this.cubePositionsF32[i * 4 + 2];
            // Block spans [cx-0.5, cx+0.5] x [cy-0.5, cy+0.5] x [cz-0.5, cz+0.5]
            // Player foot circle spans [x-radius, x+radius] x [z-radius, z+radius]
            if (cx - 0.5 < x + radius && cx + 0.5 > x - radius &&
                cz - 0.5 < z + radius && cz + 0.5 > z - radius &&
                cy - 0.5 < y && cy + 0.5 > y - height) {
                return true;
            }
        }
        return false;
    }
    cubeTypesFl() {
        return this.cubeTypesF32;
    }
}
//# sourceMappingURL=Chunk.js.map