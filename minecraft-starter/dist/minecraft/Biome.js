import { cubeTypeEnum } from "./Cube.js";
export class Biome {
    constructor(ySplit1, ySplit2, ySplit3, ySplit4, heightScaler) {
        this.ySplit1 = ySplit1;
        this.ySplit2 = ySplit2;
        this.ySplit3 = ySplit3;
        this.ySplit4 = ySplit4;
        this.heightScaler = heightScaler;
    }
    getCubeType(normPerlinNoise, height, surface) {
        let ySplit;
        if (height >= surface - 4) {
            ySplit = this.ySplit1;
        }
        else if (height >= 36) {
            ySplit = this.ySplit2;
        }
        else if (height >= 20) {
            ySplit = this.ySplit3;
        }
        else {
            ySplit = this.ySplit4;
        }
        let currPerlinValue = 0;
        let currCubeType = ySplit[0][0];
        for (const elem of ySplit) {
            currCubeType = elem[0];
            currPerlinValue += elem[1];
            if (normPerlinNoise <= currPerlinValue) {
                break;
            }
        }
        return currCubeType;
    }
}
export const plainsBiome = new Biome([
    [cubeTypeEnum.GRASS, 0.8],
    [cubeTypeEnum.STONE, 0.1],
    [cubeTypeEnum.GRAVEL, 0.1]
], [
    [cubeTypeEnum.STONE, 0.85],
    [cubeTypeEnum.GRAVEL, 0.05],
    [cubeTypeEnum.COAL, 0.05],
    [cubeTypeEnum.DIRT, 0.05],
], [
    [cubeTypeEnum.STONE, 0.75],
    [cubeTypeEnum.COAL, 0.1],
    [cubeTypeEnum.IRON, 0.1],
    [cubeTypeEnum.GOLD, 0.02],
    [cubeTypeEnum.DIAMOND, 0.01],
], [
    [cubeTypeEnum.STONE, 0.7],
    [cubeTypeEnum.IRON, 0.15],
    [cubeTypeEnum.COAL, 0.1],
    [cubeTypeEnum.GOLD, 0.03],
    [cubeTypeEnum.DIAMOND, 0.02],
    [cubeTypeEnum.EMERALD, 0.005],
], 0.25);
export const tntBiome = new Biome([
    [cubeTypeEnum.TNT, 1.0],
], [
    [cubeTypeEnum.TNT, 1.0],
], [
    [cubeTypeEnum.TNT, 1.0],
], [
    [cubeTypeEnum.TNT, 1.0],
], 0.5);
export const tundraBiome = new Biome([
    [cubeTypeEnum.SNOW, 0.6],
    [cubeTypeEnum.STONE, 0.3],
    [cubeTypeEnum.GRAVEL, 0.1]
], [
    [cubeTypeEnum.STONE, 0.75],
    [cubeTypeEnum.GRAVEL, 0.15],
    [cubeTypeEnum.COAL, 0.05],
    [cubeTypeEnum.IRON, 0.05],
], [
    [cubeTypeEnum.STONE, 0.7],
    [cubeTypeEnum.COAL, 0.2],
    [cubeTypeEnum.IRON, 0.1],
    [cubeTypeEnum.GOLD, 0.02],
], [
    [cubeTypeEnum.STONE, 0.8],
    [cubeTypeEnum.IRON, 0.15],
    [cubeTypeEnum.COAL, 0.1],
    [cubeTypeEnum.GOLD, 0.05],
], 0.7);
export const volcanoBiome = new Biome([
    [cubeTypeEnum.STONE, 0.7],
    [cubeTypeEnum.LAVA, 0.2],
    [cubeTypeEnum.GRAVEL, 0.1]
], [
    [cubeTypeEnum.STONE, 0.8],
    [cubeTypeEnum.LAVA, 0.1],
    [cubeTypeEnum.COAL, 0.05],
    [cubeTypeEnum.GRAVEL, 0.05],
], [
    [cubeTypeEnum.STONE, 0.75],
    [cubeTypeEnum.COAL, 0.1],
    [cubeTypeEnum.IRON, 0.1],
    [cubeTypeEnum.GOLD, 0.03],
    [cubeTypeEnum.DIAMOND, 0.02],
], [
    [cubeTypeEnum.STONE, 0.8],
    [cubeTypeEnum.IRON, 0.15],
    [cubeTypeEnum.COAL, 0.05],
    [cubeTypeEnum.GOLD, 0.03],
    [cubeTypeEnum.DIAMOND, 0.02],
], 0.7);
export const desertBiome = new Biome([
    [cubeTypeEnum.SAND, 0.9],
    [cubeTypeEnum.GRAVEL, 0.1],
], [
    [cubeTypeEnum.SAND, 0.4],
    [cubeTypeEnum.STONE, 0.5],
    [cubeTypeEnum.GRAVEL, 0.1],
], [
    [cubeTypeEnum.STONE, 0.8],
    [cubeTypeEnum.COAL, 0.1],
    [cubeTypeEnum.IRON, 0.07],
    [cubeTypeEnum.GOLD, 0.03],
], [
    [cubeTypeEnum.STONE, 0.7],
    [cubeTypeEnum.IRON, 0.15],
    [cubeTypeEnum.GOLD, 0.08],
    [cubeTypeEnum.DIAMOND, 0.04],
    [cubeTypeEnum.EMERALD, 0.03],
], 0.15);
export const oceanBiome = new Biome([
    [cubeTypeEnum.WATER, 0.7],
    [cubeTypeEnum.SAND, 0.2],
    [cubeTypeEnum.GRAVEL, 0.1],
], [
    [cubeTypeEnum.SAND, 0.3],
    [cubeTypeEnum.GRAVEL, 0.3],
    [cubeTypeEnum.STONE, 0.4],
], [
    [cubeTypeEnum.STONE, 0.8],
    [cubeTypeEnum.IRON, 0.1],
    [cubeTypeEnum.COAL, 0.1],
], [
    [cubeTypeEnum.STONE, 0.75],
    [cubeTypeEnum.IRON, 0.1],
    [cubeTypeEnum.GOLD, 0.05],
    [cubeTypeEnum.DIAMOND, 0.05],
    [cubeTypeEnum.EMERALD, 0.05],
], 0.5);
export const validBiomes = [
    [plainsBiome, 0.5],
    [tntBiome, 0.025],
    [tundraBiome, 0.1],
    [volcanoBiome, 0.125],
    [desertBiome, 0.1],
    [oceanBiome, 0.1]
];
//# sourceMappingURL=Biome.js.map