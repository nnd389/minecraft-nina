import { Mat4, Quat, Vec3 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";
//TODO: Generate cylinder geometry for highlighting bones

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null = null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
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
  public qTimes: Float32Array;
  public qValues: Float32Array; // length 4 * qTimes.length, xyzw

  constructor(qTimes: Float32Array, qValues: Float32Array) {
    this.qTimes = qTimes;
    this.qValues = qValues;
  }
}

export class AnimationClip {
  public name: string;
  public duration: number;
  public tracks: (BoneTrack | null)[]; // index aligned to Mesh.bones

  constructor(name: string, duration: number, tracks: (BoneTrack | null)[]) {
    this.name = name;
    this.duration = duration;
    this.tracks = tracks;
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  public name: string;
  public parent: number;
  public children: number[];
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*

  public r_i: Mat4;
  public local_endpoint: Vec3;
  public initialPosition: Vec3;
  public translationOffset: Vec3;

  constructor(bone: BoneLoader) {
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
  
  applyRotation(rot: Mat4) {
    this.r_i = Mat4.product(rot, this.r_i);
  }

  applyTranslation(offset: Vec3) {
    this.translationOffset.add(offset);
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public rootBones: Bone[];
  public materialName: string;
  public imgSrc: String | null;
  public animations: AnimationClip[];

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;
  private bindInverses: Mat4[] | null;
  private boneOrder: number[] | null; // topological traversal order, roots first

  constructor(mesh: MeshLoader) {
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
    })
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
  private ensureBoneOrder(): number[] {
    if (this.boneOrder) return this.boneOrder;
    const order: number[] = [];
    const visit = (idx: number) => {
      order.push(idx);
      for (const c of this.bones[idx].children) visit(c);
    };
    this.bones.forEach((b, i) => { if (b.parent < 0) visit(i); });
    this.boneOrder = order;
    return order;
  }

  // Compute each bone's world matrix given a per-bone LOCAL rotation.
  // Returns parallel array indexed by bone index.
  private computeBoneWorldMatrices(localRotations: Quat[]): Mat4[] {
    const order = this.ensureBoneOrder();
    const world: Mat4[] = new Array(this.bones.length);
    for (const i of order) {
      const bone = this.bones[i];
      let translate: Vec3;
      if (bone.parent >= 0) {
        translate = Vec3.difference(bone.initialPosition, this.bones[bone.parent].initialPosition);
      } else {
        translate = bone.initialPosition.copy();
      }
      const t_local = Mat4.identity.copy().translate(translate);
      const r_local = localRotations[i].toMat4();
      const local = Mat4.product(t_local, r_local);
      if (bone.parent >= 0) {
        world[i] = Mat4.product(world[bone.parent], local);
      } else {
        world[i] = local;
      }
    }
    return world;
  }

  private ensureBindInverses(): Mat4[] {
    if (this.bindInverses) return this.bindInverses;
    const identities = this.bones.map(_ => new Quat().setIdentity());
    const bindWorld = this.computeBoneWorldMatrices(identities);
    this.bindInverses = bindWorld.map(m => m.copy().inverse());
    return this.bindInverses;
  }

  // Sample a clip at time t (seconds, wrapped to clip duration) → one local Quat per bone.
  private sampleClip(clipIndex: number, t: number): Quat[] {
    const clip = this.animations[clipIndex];
    const result: Quat[] = new Array(this.bones.length);
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
        result[i] = new Quat([vals[o], vals[o+1], vals[o+2], vals[o+3]]);
        continue;
      }
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= tt) lo = mid; else hi = mid;
      }
      const t0 = times[lo], t1 = times[hi];
      const u = (tt - t0) / (t1 - t0);
      const o0 = lo * 4, o1 = hi * 4;
      const q1 = new Quat([vals[o0], vals[o0+1], vals[o0+2], vals[o0+3]]);
      const q2 = new Quat([vals[o1], vals[o1+1], vals[o1+2], vals[o1+3]]);
      result[i] = Quat.slerpShort(q1, q2, u);
    }
    return result;
  }

  // Returns a flat Float32Array of 16 floats per bone (column-major mat4),
  // each being M_i = D_i(t) * D_i(bind)^-1 — the LBS skin matrix.
  // Writes into `out` if provided (must have length >= 16*numBones) to avoid allocating.
  public computeSkinMatrices(time: number, clipIndex: number = 0, out?: Float32Array): Float32Array {
    const bind = this.ensureBindInverses();
    const rotations = (this.animations.length > 0 && clipIndex >= 0 && clipIndex < this.animations.length)
      ? this.sampleClip(clipIndex, time)
      : this.bones.map(_ => new Quat().setIdentity());
    const world = this.computeBoneWorldMatrices(rotations);
    const result = out ?? new Float32Array(16 * this.bones.length);
    for (let i = 0; i < this.bones.length; i++) {
      const skin = Mat4.product(world[i], bind[i]);
      result.set(skin.all(), i * 16);
    }
    return result;
  }

  //TODO: Create functionality for bone manipulation/key-framing

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  private updateGlobalCoords(bone: Bone, d_parent: Mat4) {
    let translate: Vec3;
    if (bone.parent >= 0 && bone.parent < this.bones.length) {
      translate = Vec3.difference(bone.initialPosition, this.bones[bone.parent].initialPosition);
    } else {
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

  public getBoneTranslations(): Float32Array {
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

  public getBoneRotations(): Float32Array {
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