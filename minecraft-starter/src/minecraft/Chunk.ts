import { Vec3 } from "../lib/TSM.js";
import { hash3D, hashToReal, randomize } from "./Random.js";
import { Mob, mobDensities, mobTypeEnum } from "./Mob.js";
import { TerrainBlockCell, TerrainLiquidCell, TerrainSnapshot } from "./TerrainSnapshot.js";
import { Biome, validBiomes, volcanoBiome, desertBiome, tundraBiome, plainsBiome, oceanBiome } from "./Biome.js";
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

type LiquidFeatureClass = 'none' | 'lowland_lake' | 'waterfall_source' | 'volcanic_pool';

interface LakeBiomeProfile {
    threshold: number;
    maxDepth: number;
    fillRatio: number;
    maxSlope: number;
    lavaChance: number;
    densityMultiplier: number;
}

interface LakeCellField {
    isLake: boolean;
    originalSurface: number;
    carvedSurface: number;
    fillHeight: number;
    liquidType: cubeTypeEnum.WATER | cubeTypeEnum.LAVA | null;
}

interface ColumnPlan {
    surface: number;
    floor: number;
    fillHeight: number;
    isLake: boolean;
    liquidType: cubeTypeEnum.WATER | cubeTypeEnum.LAVA | null;
}

export interface ChunkRenderContract {
    cubePositions(): Float32Array;
    numCubes(): number;
    cubeColors(): Float32Array;
    getMobs(): Mob[];
    
}

export class Chunk implements ChunkRenderContract {
    private cubes: number;
    private cubePositionsF32: Float32Array;
    private cubeTypes: cubeTypeEnum[];
    private cubeTypesF32: Float32Array;
    private mobs: Mob[];
    
    private cubeColorsF32: Float32Array;
    private x: number;
    private z: number;
    private size: number;
    private minSurfaceLevel: number;

    private blockTypesByWorld: Map<string, cubeTypeEnum>;
    private surfaceHeights: number[][];
    private liquidCells: TerrainLiquidCell[];
    private terrainSnapshot: TerrainSnapshot | null;

    private biomeField: Biome[][];
    private baseHeightField: number[][];
    private lakeField: LakeCellField[][];


    constructor(centerX : number, centerZ : number, size: number) {
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
        this.blockTypesByWorld = new Map<string, cubeTypeEnum>();
        this.surfaceHeights = this.createZeroField();
        this.liquidCells = [];
        this.terrainSnapshot = null;
        this.generateCubes();
    }

    private generateCubes(): void {
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

    private buildHeightField(topLeftX: number, topLeftZ: number, biomeField: Biome[][]): number[][] {
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
                for(let dx = -scalerSmoothRadius; dx <= scalerSmoothRadius; dx++){
                    for(let dz = -scalerSmoothRadius; dz <= scalerSmoothRadius; dz++){
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
                for(let dx = -smoothRadius; dx <= smoothRadius; dx++){
                    for(let dz = -smoothRadius; dz <= smoothRadius; dz++){
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

    private buildBiomeField(topLeftX: number, topLeftZ: number): Biome[][] {
        const biomeField = new Array(this.size)
            .fill(null)
            .map(() => new Array(this.size).fill(validBiomes[0][0]));

        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biomeTypeNoiseValue = perlinNoise(
                    worldX * BIOME_SCALE / this.size,
                    worldZ * BIOME_SCALE / this.size,
                    0,
                    biomeSeed,
                );
                const biomeTypeNoiseNorm = (biomeTypeNoiseValue + 1.0) / 2.0;
                biomeField[localX][localZ] = this.pickBiome(biomeTypeNoiseNorm);
            }
        }

        return biomeField;
    }

    // ---- Lake Generation Pipeline ----

    private buildLakeField(
        topLeftX: number,
        topLeftZ: number,
        baseHeights: number[][],
        biomeField: Biome[][],
    ): LakeCellField[][] {
        let lakeField = this.generateLakeCandidates(
            topLeftX, topLeftZ, baseHeights, biomeField, 0, 0,
        );

        lakeField = this.refineLakeConnectivity(lakeField);
        lakeField = this.validateBasinContainment(lakeField, baseHeights);

        const targetCoverage = this.computeTargetCoverage(biomeField);
        for (let pass = 0; pass < BACKFILL_MAX_PASSES; pass++) {
            if (this.computeWaterCoverage(lakeField) >= targetCoverage) break;

            const thresholdDelta = (pass + 1) * BACKFILL_THRESHOLD_DELTA;
            const slopeDelta = (pass + 1) * BACKFILL_SLOPE_DELTA;
            lakeField = this.backfillLakeCandidates(
                lakeField, topLeftX, topLeftZ, baseHeights, biomeField,
                thresholdDelta, slopeDelta,
            );
            lakeField = this.refineLakeConnectivity(lakeField);
            lakeField = this.validateBasinContainment(lakeField, baseHeights);
        }

        lakeField = this.addWaterfallSources(lakeField, topLeftX, topLeftZ, baseHeights);

        return lakeField;
    }

    private generateLakeCandidates(
        topLeftX: number,
        topLeftZ: number,
        baseHeights: number[][],
        biomeField: Biome[][],
        thresholdDelta: number,
        slopeDelta: number,
    ): LakeCellField[][] {
        const lakeField = this.createEmptyLakeField(baseHeights);

        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biome = biomeField[localX][localZ];
                const originalSurface = baseHeights[localX][localZ];
                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);

                const candidate = this.evaluateLakeCell(
                    worldX, worldZ, originalSurface, localSlope, biome,
                    thresholdDelta, slopeDelta,
                );
                if (candidate !== null) {
                    lakeField[localX][localZ] = candidate;
                }
            }
        }

        return lakeField;
    }

    private evaluateLakeCell(
        worldX: number,
        worldZ: number,
        originalSurface: number,
        localSlope: number,
        biome: Biome,
        thresholdDelta: number,
        slopeDelta: number,
    ): LakeCellField | null {
        const featureClass = this.classifyStaticLiquidFeature(originalSurface, biome);
        if (featureClass === 'none') return null;

        const profile = this.getLakeBiomeProfile(biome);
        const adjustedThreshold = Math.max(0.1, profile.threshold - thresholdDelta);
        const adjustedMaxSlope = profile.maxSlope + slopeDelta;

        const mask = this.sampleLakeMask(worldX, worldZ, adjustedThreshold);
        if (localSlope > adjustedMaxSlope || mask <= 0) return null;

        if (mask < 0.24) {
            const edgeRoll = hashToReal(randomize(lakeEdgeTieSeed, hash3D(worldX, 0, worldZ)));
            if (edgeRoll > mask) return null;
        }

        const depthNoise = this.normalizedPerlin(worldX * 0.095, worldZ * 0.095, lakeDepthSeed);
        const basinDepth = this.clamp(
            Math.floor(1 + (mask * 0.75 + depthNoise * 0.25) * profile.maxDepth),
            1,
            profile.maxDepth,
        );
        const carvedSurface = Math.max(4, originalSurface - basinDepth);

        const fillNoise = this.normalizedPerlin(worldX * 0.07, worldZ * 0.07, lakeFillSeed);
        const fillSpan = Math.max(1, Math.floor(basinDepth * profile.fillRatio + fillNoise * 2.0));
        const fillHeight = Math.min(originalSurface - 1, carvedSurface + fillSpan);

        if (fillHeight <= carvedSurface) return null;

        const liquidType = this.getRegionLiquidType(worldX, worldZ, featureClass, biome, originalSurface);

        return {
            isLake: true,
            originalSurface,
            carvedSurface,
            fillHeight,
            liquidType,
        };
    }

    private backfillLakeCandidates(
        lakeField: LakeCellField[][],
        topLeftX: number,
        topLeftZ: number,
        baseHeights: number[][],
        biomeField: Biome[][],
        thresholdDelta: number,
        slopeDelta: number,
    ): LakeCellField[][] {
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake) continue;

                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const biome = biomeField[localX][localZ];
                const originalSurface = baseHeights[localX][localZ];
                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);

                const candidate = this.evaluateLakeCell(
                    worldX, worldZ, originalSurface, localSlope, biome,
                    thresholdDelta, slopeDelta,
                );
                if (candidate !== null) {
                    lakeField[localX][localZ] = candidate;
                }
            }
        }
        return lakeField;
    }

    private refineLakeConnectivity(lakeField: LakeCellField[][]): LakeCellField[][] {
        const visited = new Array(this.size).fill(null).map(() => new Array(this.size).fill(false));
        const offsets: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const componentCells: [number, number][] = [];

        const floodFill = (startX: number, startZ: number, liquidType: cubeTypeEnum.WATER | cubeTypeEnum.LAVA): void => {
            const queue: [number, number][] = [[startX, startZ]];
            visited[startX][startZ] = true;
            while (queue.length > 0) {
                const [x, z] = queue.shift()!;
                componentCells.push([x, z]);
                for (const [dx, dz] of offsets) {
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || visited[nx][nz]) continue;
                    const nextCell = lakeField[nx][nz];
                    if (!nextCell.isLake || nextCell.liquidType !== liquidType) continue;
                    visited[nx][nz] = true;
                    queue.push([nx, nz]);
                }
            }
        };

        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (visited[localX][localZ]) continue;
                const seedCell = lakeField[localX][localZ];
                if (!seedCell.isLake || seedCell.liquidType === null) continue;

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
                    const cappedFill = this.clamp(
                        sharedFillHeight, cell.carvedSurface + 1, cell.originalSurface - 1,
                    );
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

    private validateBasinContainment(
        lakeField: LakeCellField[][],
        baseHeights: number[][],
    ): LakeCellField[][] {
        const visited = new Array(this.size).fill(null).map(() => new Array(this.size).fill(false));
        const offsets: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const componentCells: [number, number][] = [];

        const floodFill = (startX: number, startZ: number, liquidType: cubeTypeEnum.WATER | cubeTypeEnum.LAVA): void => {
            const queue: [number, number][] = [[startX, startZ]];
            visited[startX][startZ] = true;
            while (queue.length > 0) {
                const [x, z] = queue.shift()!;
                componentCells.push([x, z]);
                for (const [dx, dz] of offsets) {
                    const nx = x + dx;
                    const nz = z + dz;
                    if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || visited[nx][nz]) continue;
                    const nextCell = lakeField[nx][nz];
                    if (!nextCell.isLake || nextCell.liquidType !== liquidType) continue;
                    visited[nx][nz] = true;
                    queue.push([nx, nz]);
                }
            }
        };

        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (visited[localX][localZ]) continue;
                const seedCell = lakeField[localX][localZ];
                if (!seedCell.isLake || seedCell.liquidType === null) continue;

                componentCells.length = 0;
                floodFill(localX, localZ, seedCell.liquidType);

                const waterline = lakeField[componentCells[0][0]][componentCells[0][1]].fillHeight;
                const componentSet = new Set(componentCells.map(([x, z]) => `${x},${z}`));
                const perimeterSeen = new Set<string>();
                let perimeterTotal = 0;
                let perimeterBreach = 0;

                for (const [x, z] of componentCells) {
                    for (const [dx, dz] of offsets) {
                        const nx = x + dx;
                        const nz = z + dz;
                        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
                        const key = `${nx},${nz}`;
                        if (componentSet.has(key) || perimeterSeen.has(key)) continue;
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

    private addWaterfallSources(
        lakeField: LakeCellField[][],
        topLeftX: number,
        topLeftZ: number,
        baseHeights: number[][],
    ): LakeCellField[][] {
        const offsets: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake) continue;

                const originalSurface = baseHeights[localX][localZ];
                if (originalSurface < WATERFALL_MIN_ELEVATION) continue;

                const localSlope = this.computeLocalSlope(baseHeights, localX, localZ);
                if (localSlope < 3) continue;

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
                if (!hasDownhill) continue;

                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const waterfallRoll = hashToReal(
                    randomize("WATERFALL", hash3D(worldX, originalSurface, worldZ)),
                );
                if (waterfallRoll > WATERFALL_SPAWN_CHANCE) continue;

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

    private computeWaterCoverage(lakeField: LakeCellField[][]): number {
        let count = 0;
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                if (lakeField[localX][localZ].isLake) count++;
            }
        }
        return count;
    }

    private computeTargetCoverage(biomeField: Biome[][]): number {
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

    private createEmptyLakeField(baseHeights: number[][]): LakeCellField[][] {
        return new Array(this.size).fill(null).map((_, localX) =>
            new Array(this.size).fill(null).map((_, localZ) => ({
                isLake: false,
                originalSurface: baseHeights[localX][localZ],
                carvedSurface: baseHeights[localX][localZ],
                fillHeight: baseHeights[localX][localZ],
                liquidType: null,
            })),
        );
    }

    private resetLakeCell(lakeField: LakeCellField[][], x: number, z: number): void {
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

    private buildColumnPlans(baseHeights: number[][], lakeField: LakeCellField[][]): ColumnPlan[][] {
        const plans = new Array(this.size)
            .fill(null)
            .map(() => new Array(this.size).fill(null).map(() => ({
                surface: 0,
                floor: 0,
                fillHeight: 0,
                isLake: false,
                liquidType: null,
            } as ColumnPlan)));

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

    private populateCanonicalBlocks(
        topLeftX: number,
        topLeftZ: number,
        biomeField: Biome[][],
        columnPlans: ColumnPlan[][],
    ): void {
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

    private generateMobs(topLeftX: number, topLeftZ: number, columnPlans: ColumnPlan[][]): void {
        this.mobs = [];
        for (let localX = 0; localX < this.size; localX++) {
            for (let localZ = 0; localZ < this.size; localZ++) {
                const plan = columnPlans[localX][localZ];
                if (plan.isLake) continue;

                const worldX = topLeftX + localX;
                const worldZ = topLeftZ + localZ;
                const spawnY = plan.surface + 1;
                const pointHash = hash3D(worldX, spawnY, worldZ);
                const typeRoll = hashToReal(randomize("MOBTYPE", pointHash));
                const orientationRoll = hashToReal(randomize("MOBROT", pointHash));

                let cumulativeDensity = 0;
                let selectedType: mobTypeEnum | null = null;
                for (const [mobType, density] of mobDensities) {
                    cumulativeDensity += density;
                    if (typeRoll <= cumulativeDensity) {
                        selectedType = mobType;
                        break;
                    }
                }

                if (selectedType === null) continue;

                this.mobs.push(
                    new Mob(
                        selectedType,
                        new Vec3([worldX, spawnY, worldZ]),
                        orientationRoll * 2 * Math.PI,
                    ),
                );
                //this.drawMesh(this.wolfMesh, positions, rotations);
            }
        }
       // console.log("mobs are: ", this.mobs)
        //this.drawMesh(this.wolfMesh, positions, rotations);
    }

    // ---- Render Buffers ----

    private emitRenderBuffers(): void {
        const cubePositions: number[] = [];
        const cubeColors: number[] = [];
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

    private getColumnCubeType(worldX: number, worldZ: number, y: number, surface: number, biome: Biome): cubeTypeEnum {
        const cubeTypeNoiseValue = perlinNoise(worldX / this.size, worldZ / this.size, y / 100.0, cubeTypeSeed);
        const cubeTypeNoiseNorm = (cubeTypeNoiseValue + 1.0) / 2.0;
        return biome.getCubeType(cubeTypeNoiseNorm, y, surface);
    }

    private pickBiome(normNoise: number): Biome {
        let cumulative = 0;
        let selected = validBiomes[0][0];
        for (const [biome, probability] of validBiomes) {
            selected = biome;
            cumulative += probability;
            if (normNoise <= cumulative) break;
        }
        return selected;
    }

    private classifyStaticLiquidFeature(surface: number, biome: Biome): LiquidFeatureClass {
        if (biome === volcanoBiome && surface <= LAVA_MAX_ELEVATION) {
            return 'volcanic_pool';
        }
        if (surface <= LAKE_MAX_ELEVATION) {
            return 'lowland_lake';
        }
        return 'none';
    }

    private getRegionLiquidType(
        worldX: number,
        worldZ: number,
        featureClass: LiquidFeatureClass,
        biome: Biome,
        surface: number,
    ): cubeTypeEnum.WATER | cubeTypeEnum.LAVA {
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

    private getLakeBiomeProfile(biome: Biome): LakeBiomeProfile {
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

    private sampleLakeMask(worldX: number, worldZ: number, threshold: number): number {
        const macroNoise = this.normalizedPerlin(worldX * 0.012, worldZ * 0.012, lakeMaskSeed);
        const shapeNoise = this.normalizedPerlin(worldX * 0.045, worldZ * 0.045, lakeShapeSeed);

        const macroMask = this.smoothstep(threshold, Math.min(0.98, threshold + 0.22), macroNoise);
        const shorelineMask = this.smoothstep(0.38, 0.9, shapeNoise);
        return this.clamp(macroMask * shorelineMask, 0.0, 1.0);
    }

    private computeLocalSlope(heightField: number[][], localX: number, localZ: number): number {
        const center = heightField[localX][localZ];
        const neighbors = [
            this.getFieldValue(heightField, localX - 1, localZ, center),
            this.getFieldValue(heightField, localX + 1, localZ, center),
            this.getFieldValue(heightField, localX, localZ - 1, center),
            this.getFieldValue(heightField, localX, localZ + 1, center),
        ];

        return Math.max(...neighbors.map((n) => Math.abs(n - center)));
    }

    private computeColumnFloor(surfaceHeights: number[][], localX: number, localZ: number): number {
        const n1 = this.getFieldValue(surfaceHeights, localX - 1, localZ, 0);
        const n2 = this.getFieldValue(surfaceHeights, localX + 1, localZ, 0);
        const n3 = this.getFieldValue(surfaceHeights, localX, localZ - 1, 0);
        const n4 = this.getFieldValue(surfaceHeights, localX, localZ + 1, 0);
        const minNeighbor = Math.min(n1, n2, n3, n4);
        return Math.max(0, Math.floor(Math.max(minNeighbor - 1, 0)));
    }

    // ---- Generic Utilities ----

    private getFieldValue(field: number[][], x: number, z: number, fallback: number): number {
        if (x < 0 || z < 0 || x >= this.size || z >= this.size) return fallback;
        return field[x][z];
    }

    private normalizedPerlin(x: number, z: number, seed: string): number {
        return (perlinNoise(x, z, 0, seed) + 1.0) / 2.0;
    }

    private smoothstep(edge0: number, edge1: number, x: number): number {
        if (edge0 === edge1) return x < edge0 ? 0 : 1;
        const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private setBlock(worldX: number, worldY: number, worldZ: number, cubeType: cubeTypeEnum): void {
        this.blockTypesByWorld.set(this.blockKey(worldX, worldY, worldZ), cubeType);
    }

    private blockKey(worldX: number, worldY: number, worldZ: number): string {
        return `${worldX}|${worldY}|${worldZ}`;
    }

    private parseBlockKey(key: string): [number, number, number] {
        const [x, y, z] = key.split("|").map((value) => Number.parseInt(value, 10));
        return [x, y, z];
    }

    private createZeroField(): number[][] {
        return new Array(this.size).fill(null).map(() => new Array(this.size).fill(0));
    }

    // ---- Snapshot ----

    private buildTerrainSnapshot(): TerrainSnapshot {
        const blocks: TerrainBlockCell[] = [];
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
            liquidCells: this.liquidCells.map((cell) => ({ ...cell })),
        };
    }

    public getTerrainSnapshot(): TerrainSnapshot {
        if (this.terrainSnapshot === null) {
            this.terrainSnapshot = this.buildTerrainSnapshot();
        }

        return {
            ...this.terrainSnapshot,
            surfaceHeights: this.terrainSnapshot.surfaceHeights.map((row) => row.slice()),
            blocks: this.terrainSnapshot.blocks.map((block) => ({ ...block })),
            liquidCells: this.terrainSnapshot.liquidCells.map((cell) => ({ ...cell })),
        };
    }

    public getInitialLiquidCells(): TerrainLiquidCell[] {
        return this.getTerrainSnapshot().liquidCells;
    }

    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }

    public numCubes(): number {
        return this.cubes;
    }

    public cubeColors(): Float32Array {
        return this.cubeColorsF32;
    }

    public getMobs(): Mob[] {
        return this.mobs;
    }

    public isColliding(x: number, y: number, z: number, radius: number = 0.4, height: number = 2) {
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

    public cubeTypesFl(): Float32Array {
        return this.cubeTypesF32;
    }
}
