import { cubeTypeEnum } from "./Cube.js";

export interface TerrainBlockCell {
    worldX: number;
    worldY: number;
    worldZ: number;
    type: cubeTypeEnum;
}

export interface TerrainLiquidCell {
    worldX: number;
    worldY: number;
    worldZ: number;
    type: cubeTypeEnum.WATER | cubeTypeEnum.LAVA;
}

export interface TerrainSnapshot {
    chunkCenterX: number;
    chunkCenterZ: number;
    size: number;
    minSurfaceLevel: number;
    surfaceHeights: number[][];
    blocks: TerrainBlockCell[];
    liquidCells: TerrainLiquidCell[];
}
