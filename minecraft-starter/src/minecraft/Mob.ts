import { Vec3, Mat4 } from "../lib/TSM.js";

// Mobs have orientation, so they cannot be modeled as blocks.
export enum mobTypeEnum {
    WOLF = 0,
    CREEPER = 1,
    _LENGTH
};

// Densities of each type of mob, in mobs/block.
// Currently biome-independent.
// TODO: integrate with Biome class to make biome-dependent.
export const mobDensities: [mobTypeEnum, number][] =
  [
    [mobTypeEnum.WOLF, 0.001],
    [mobTypeEnum.CREEPER, 0.001],
  ]

export class Mob {
    public readonly kind: mobTypeEnum;

    // center as a 3D point, [x, z, y] coordinates
    public center: Vec3;

    // direction the mob is facing in [x, y] plane
    // [x, y] = [cos(orientation), sin(orientation)]
    public orientation: number;
    public velocity: Vec3; //mobs have velocity directed toward player
    public health: number;
    public animTime: number = 0;
    public animationSpeed: number = 1.0;

    constructor(kind : mobTypeEnum, center : Vec3, orientation : number) {
        this.kind = kind;
        this.center = center;
        this.orientation = orientation;
        this.velocity = new Vec3([0, 0, 0]);
        this.health = 3; // start with 5HP - can change later
    }

    // In order to avoid confusion about the interface with respect
    // to coordinates, it's best to just convert the mob's position and
    // orientation to an unambiguous local-to-world transform here.
    // Coordinate order matches that of Chunk.cubePositionsF32 (XZYW).
    // This assumes the mob faces in the X direction in local coords,
    // although the game will look correct as long as the mob's nose
    // points anywhere in the local XY plane.
    public getModelMatrix() : Mat4 { 
        // first rotate by orientation, then translate by center

        let x = Math.cos(this.orientation);
        let y = Math.sin(this.orientation);
        // rotation matrix:
        // x 0 -y 0
        // 0 1 0 0
        // y 0 x 0
        // 0 0 0 1

        let cx = this.center.x;
        let cz = this.center.y;
        let cy = this.center.z;
        // translation matrix:
        // 1 0 0 cx
        // 0 1 0 cz
        // 0 0 1 cy
        // 0 0 0 1

        // product
        // x 0 -y cx
        // 0 1 0 cz
        // y 0 x cy
        // 0 0 0 1
        return new Mat4([
            x, 0, -y, cx,
            0, 1,  0, cz,
            y, 0,  x, cy,
            0, 0,  0,  1,
        ]);
    }
}