import { Vec3, Mat4 } from "../lib/TSM.js";
// Mobs have orientation, so they cannot be modeled as blocks.
export var mobTypeEnum;
(function (mobTypeEnum) {
    mobTypeEnum[mobTypeEnum["WOLF"] = 0] = "WOLF";
    mobTypeEnum[mobTypeEnum["CREEPER"] = 1] = "CREEPER";
    mobTypeEnum[mobTypeEnum["_LENGTH"] = 2] = "_LENGTH";
})(mobTypeEnum || (mobTypeEnum = {}));
;
// Densities of each type of mob, in mobs/block.
// Currently biome-independent.
// TODO: integrate with Biome class to make biome-dependent.
export const mobDensities = [
    [mobTypeEnum.WOLF, 0.001],
    [mobTypeEnum.CREEPER, 0.001],
];
export class Mob {
    constructor(kind, center, orientation) {
        this.animTime = 0;
        this.animationSpeed = 1.0;
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
    getModelMatrix() {
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
            0, 1, 0, cz,
            y, 0, x, cy,
            0, 0, 0, 1,
        ]);
    }
}
//# sourceMappingURL=Mob.js.map