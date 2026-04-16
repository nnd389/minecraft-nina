import { Mat4, Quat, Vec3 } from "../lib/TSM.js";
//TODO: Generate cylinder geometry for highlighting bones
//General class for handling GLSL attributes
export class Attribute {
    constructor(attr) {
        this.values = attr.values;
        this.count = attr.count;
        this.itemSize = attr.itemSize;
    }
}
//Class for handling mesh vertices and skin weights
export class MeshGeometry {
    constructor(mesh) {
        this.uv = null;
        this.position = new Attribute(mesh.position);
        this.normal = new Attribute(mesh.normal);
        if (mesh.uv) {
            this.uv = new Attribute(mesh.uv);
        }
        this.skinIndex = new Attribute(mesh.skinIndex);
        this.skinWeight = new Attribute(mesh.skinWeight);
        this.v0 = new Attribute(mesh.v0);
        this.v1 = new Attribute(mesh.v1);
        this.v2 = new Attribute(mesh.v2);
        this.v3 = new Attribute(mesh.v3);
    }
}
// Per-bone keyframe data extracted from the source file.
// Only quaternion (rotation) tracks are honored; translation/scale are ignored.
export class BoneTrack {
    constructor(qTimes, qValues) {
        this.qTimes = qTimes;
        this.qValues = qValues;
    }
}
export class AnimationClip {
    constructor(name, duration, tracks) {
        this.name = name;
        this.duration = duration;
        this.tracks = tracks;
    }
}
//Class for handling bones in the skeleton rig
export class Bone {
    constructor(bone) {
        this.name = bone.name;
        this.parent = bone.parent;
        this.children = Array.from(bone.children);
        this.position = bone.position.copy();
        this.endpoint = bone.endpoint.copy();
        this.rotation = bone.rotation.copy();
        this.r_i = Mat4.identity;
        this.local_endpoint = Vec3.difference(this.endpoint, this.position);
        this.initialPosition = bone.position.copy();
        this.translationOffset = new Vec3([0, 0, 0]);
    }
    applyRotation(rot) {
        this.r_i = Mat4.product(rot, this.r_i);
    }
    applyTranslation(offset) {
        this.translationOffset.add(offset);
    }
}
//Class for handling the overall mesh and rig
export class Mesh {
    constructor(mesh) {
        this.geometry = new MeshGeometry(mesh.geometry);
        this.worldMatrix = mesh.worldMatrix.copy();
        this.rotation = mesh.rotation.copy();
        this.bones = [];
        this.rootBones = [];
        mesh.bones.forEach(bone => {
            this.bones.push(new Bone(bone));
        });
        this.bones.forEach(bone => {
            if (bone.parent < 0) {
                this.rootBones.push(bone);
            }
        });
        this.materialName = mesh.materialName;
        this.imgSrc = null;
        this.boneIndices = Array.from(mesh.boneIndices);
        this.bonePositions = new Float32Array(mesh.bonePositions);
        this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
        this.animations = [];
        this.bindInverses = null;
        this.boneOrder = null;
    }
    // Topological order of bones (each parent appears before its children).
    ensureBoneOrder() {
        if (this.boneOrder)
            return this.boneOrder;
        const order = [];
        const visit = (idx) => {
            order.push(idx);
            for (const c of this.bones[idx].children)
                visit(c);
        };
        this.bones.forEach((b, i) => { if (b.parent < 0)
            visit(i); });
        this.boneOrder = order;
        return order;
    }
    // Compute each bone's world matrix given a per-bone LOCAL rotation.
    // Returns parallel array indexed by bone index.
    computeBoneWorldMatrices(localRotations) {
        const order = this.ensureBoneOrder();
        const world = new Array(this.bones.length);
        for (const i of order) {
            const bone = this.bones[i];
            let translate;
            if (bone.parent >= 0) {
                translate = Vec3.difference(bone.initialPosition, this.bones[bone.parent].initialPosition);
            }
            else {
                translate = bone.initialPosition.copy();
            }
            const t_local = Mat4.identity.copy().translate(translate);
            const r_local = localRotations[i].toMat4();
            const local = Mat4.product(t_local, r_local);
            if (bone.parent >= 0) {
                world[i] = Mat4.product(world[bone.parent], local);
            }
            else {
                world[i] = local;
            }
        }
        return world;
    }
    ensureBindInverses() {
        if (this.bindInverses)
            return this.bindInverses;
        const identities = this.bones.map(_ => new Quat().setIdentity());
        const bindWorld = this.computeBoneWorldMatrices(identities);
        this.bindInverses = bindWorld.map(m => m.copy().inverse());
        return this.bindInverses;
    }
    // Sample a clip at time t (seconds, wrapped to clip duration) → one local Quat per bone.
    sampleClip(clipIndex, t) {
        const clip = this.animations[clipIndex];
        const result = new Array(this.bones.length);
        const dur = clip.duration > 0 ? clip.duration : 1;
        const tt = ((t % dur) + dur) % dur;
        for (let i = 0; i < this.bones.length; i++) {
            const track = clip.tracks[i];
            if (!track || track.qTimes.length === 0) {
                result[i] = new Quat().setIdentity();
                continue;
            }
            const times = track.qTimes;
            const vals = track.qValues;
            if (tt <= times[0]) {
                result[i] = new Quat([vals[0], vals[1], vals[2], vals[3]]);
                continue;
            }
            const last = times.length - 1;
            if (tt >= times[last]) {
                const o = last * 4;
                result[i] = new Quat([vals[o], vals[o + 1], vals[o + 2], vals[o + 3]]);
                continue;
            }
            let lo = 0;
            let hi = last;
            while (hi - lo > 1) {
                const mid = (lo + hi) >> 1;
                if (times[mid] <= tt)
                    lo = mid;
                else
                    hi = mid;
            }
            const t0 = times[lo], t1 = times[hi];
            const u = (tt - t0) / (t1 - t0);
            const o0 = lo * 4, o1 = hi * 4;
            const q1 = new Quat([vals[o0], vals[o0 + 1], vals[o0 + 2], vals[o0 + 3]]);
            const q2 = new Quat([vals[o1], vals[o1 + 1], vals[o1 + 2], vals[o1 + 3]]);
            result[i] = Quat.slerpShort(q1, q2, u);
        }
        return result;
    }
    // Returns a flat Float32Array of 16 floats per bone (column-major mat4),
    // each being M_i = D_i(t) * D_i(bind)^-1 — the LBS skin matrix.
    // Writes into `out` if provided (must have length >= 16*numBones) to avoid allocating.
    computeSkinMatrices(time, clipIndex = 0, out) {
        const bind = this.ensureBindInverses();
        const rotations = (this.animations.length > 0 && clipIndex >= 0 && clipIndex < this.animations.length)
            ? this.sampleClip(clipIndex, time)
            : this.bones.map(_ => new Quat().setIdentity());
        const world = this.computeBoneWorldMatrices(rotations);
        const result = out !== null && out !== void 0 ? out : new Float32Array(16 * this.bones.length);
        for (let i = 0; i < this.bones.length; i++) {
            const skin = Mat4.product(world[i], bind[i]);
            result.set(skin.all(), i * 16);
        }
        return result;
    }
    //TODO: Create functionality for bone manipulation/key-framing
    getBoneIndices() {
        return new Uint32Array(this.boneIndices);
    }
    getBonePositions() {
        return this.bonePositions;
    }
    getBoneIndexAttribute() {
        return this.boneIndexAttribute;
    }
    updateGlobalCoords(bone, d_parent) {
        let translate;
        if (bone.parent >= 0 && bone.parent < this.bones.length) {
            translate = Vec3.difference(bone.initialPosition, this.bones[bone.parent].initialPosition);
        }
        else {
            translate = Vec3.sum(bone.initialPosition, bone.translationOffset);
        }
        let t_ji = Mat4.identity.copy().translate(translate);
        let d_bone = Mat4.product(t_ji, bone.r_i);
        d_bone = Mat4.product(d_parent, d_bone);
        for (let c of bone.children) {
            this.updateGlobalCoords(this.bones[c], d_bone);
        }
        bone.position = d_bone.multiplyPt3(new Vec3([0, 0, 0]));
        bone.endpoint = d_bone.multiplyPt3(bone.local_endpoint);
        bone.rotation = d_bone.toMat3().toQuat();
    }
    getBoneTranslations() {
        for (let b of this.rootBones) {
            this.updateGlobalCoords(b, Mat4.identity);
        }
        let trans = new Float32Array(3 * this.bones.length);
        this.bones.forEach((bone, index) => {
            let res = bone.position.xyz;
            for (let i = 0; i < res.length; i++) {
                trans[3 * index + i] = res[i];
            }
        });
        return trans;
    }
    getBoneRotations() {
        for (let b of this.rootBones) {
            this.updateGlobalCoords(b, Mat4.identity);
        }
        let trans = new Float32Array(4 * this.bones.length);
        this.bones.forEach((bone, index) => {
            let res = bone.rotation.xyzw;
            for (let i = 0; i < res.length; i++) {
                trans[4 * index + i] = res[i];
            }
        });
        return trans;
    }
}
//# sourceMappingURL=Scene.js.map