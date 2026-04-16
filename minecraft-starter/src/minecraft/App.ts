import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {

  blankCubeFSText,
  blankCubeVSText,
  meshVSText,
  meshFSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { Quat } from "../lib/tsm/Quat.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube, cubeTypeEnum, typeToColor } from "./Cube.js";
import { Chunk } from "./Chunk.js";
import { Mesh } from "./Scene.js";
import { Mob } from "./Mob.js";
import { CLoader } from "./AnimationFileLoader.js";
import { Inventory, InventorySlot, makeEmptyInventory, addItem, removeItem, ITEM_DATA, isSlotEmpty, itemTypeEnum } from "./Inventory.js";

type CraftingLayout = {
  inputRects: { x: number; y: number; w: number; h: number }[];
  outputRect: { x: number; y: number; w: number; h: number };
  cols: number;
  rows: number;
};

type InventoryScreenLayout = {
  panelX: number; panelY: number; panelW: number; panelH: number;
  armorStartX: number; armorStartY: number;
  avatarX: number; avatarY: number; avatarW: number; avatarH: number;
  crafting: CraftingLayout;
  inventoryStartX: number; inventoryStartY: number; hotbarY: number;
};

type SlotRef = { type: 'inventory' | 'crafting' | 'output' | 'armor' | 'panel', index: number, slot: InventorySlot | null };
const chunkSize = 64;
const chunksToLoad = 1;

export class MinecraftAnimation extends CanvasAnimation {
  public playerHealth: number = 20; // 20 halves = 10 full hearts
  public playerMaxHealth: number = 20;

  private gui: GUI;
  
  private chunks: Map<string, Chunk>
  private curChunkX: number;
  private curChunkY: number;

  private totalNumCubes!: number;
  private cubePositionsF32!: Float32Array;
  private cubeColorsF32!: Float32Array;
  private cubeTypesF32!: Float32Array;

  private mobPositionsF32: Float32Array;
  private mobColorsF32: Float32Array;
  private mobs: Mob[];

  
  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Mesh Rendering */
  private meshRenderPasses: Map<Mesh, { pass: RenderPass, indexCount: number }> = new Map();
  private wolfMesh: Mesh | null = null;
  private wolfLoader: CLoader | null = null;
  private mobAnimationTime: number = 0;
  private readonly WOLF_FACING_OFFSET = (3 * Math.PI) / 2;
  

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  private hudContext: CanvasRenderingContext2D;
  
  // Player's head position in world coordinate.
  // Player should extend two units down from this location, and 0.4 units radially.
  private playerPosition: Vec3;
  private velocity: Vec3;
  private lastTime: number;
  private supported: boolean;

  private inventory: Inventory;
  private heldItem: InventorySlot;
  private craftingSlots: InventorySlot[];
  private itemImages: Map<string, HTMLImageElement>;

  private readonly SLOT_SIZE = 70;
  private readonly GAP = 6;
  private readonly HOTBAR_Y_OFFSET = 300;
  private readonly INVENTORY_VERTICAL_OFFSET = 30;

  private craftingOutputSlot: InventorySlot = { itemType: null, count: 0 };
  private armorSlots: InventorySlot[];
  private dragState: {
    active: boolean;
    button: number;
    slots: Set<InventorySlot>;
    initialHandCount: number;
    initialHandType: itemTypeEnum | null;
    originalSlotCounts: Map<InventorySlot, number>;
  } | null = null;
  private lastClick: { time: number; slot: InventorySlot | null } = { time: 0, slot: null };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;

    this.hudContext = this.canvas2d.getContext("2d") as CanvasRenderingContext2D;
  
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;

    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = this.gui.getCamera().pos();
    this.velocity = new Vec3();
    this.lastTime = performance.now();
    this.supported = true;
    

    this.inventory = makeEmptyInventory(36);
    this.heldItem = { itemType: null, count: 0 };
    
    this.itemImages = new Map();
    for (const key in ITEM_DATA) {
      const item = ITEM_DATA[key as unknown as itemTypeEnum];
      if (item.texturePath) {
        const img = new Image();
        img.src = item.texturePath;
        this.itemImages.set(item.texturePath, img);
      }
    }

    this.craftingSlots = [
      { itemType: null, count: 0 },
      { itemType: null, count: 0 },
      { itemType: null, count: 0 },
      { itemType: null, count: 0 }
    ];

    this.armorSlots = [
      { itemType: null, count: 0 }, // Helmet
      { itemType: null, count: 0 }, // Chestplate
      { itemType: null, count: 0 }, // Leggings
      { itemType: null, count: 0 }  // Boots
    ]

    // temporary test code to populate inventory
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 32);
    addItem(this.inventory, itemTypeEnum.STONE_BLOCK, 12);
    addItem(this.inventory, itemTypeEnum.GOLD_BLOCK, 5);
    addItem(this.inventory, itemTypeEnum.STICK, 20);
    addItem(this.inventory, itemTypeEnum.IRON_INGOT, 8);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 16);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 45);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 32);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 64);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 20);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 45);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 64);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 64);
    addItem(this.inventory, itemTypeEnum.DIRT_BLOCK, 64);
    addItem(this.inventory, itemTypeEnum.IRON_HELMET, 1);
    addItem(this.inventory, itemTypeEnum.IRON_CHESTPLATE, 1);
    addItem(this.inventory, itemTypeEnum.IRON_LEGGINGS, 1);
    addItem(this.inventory, itemTypeEnum.IRON_BOOTS, 1);


    this.chunks = new Map<string, Chunk>();

    this.curChunkX = coordToChunk(this.playerPosition.x);
    this.curChunkY = coordToChunk(this.playerPosition.z);

    this.updateChunkMap(this.curChunkX, this.curChunkY);

    this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText);
    this.cubeGeometry = new Cube();
    this.initBlankCube();
    
    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);

    //Load a wolf mesh from a Collada file to verify drawMesh works
    //this.wolfLoader = new CLoader("./assets/mesh/wolf.dae");
    this.wolfLoader = new CLoader("./assets/mesh/wolfAnimated.dae");
    this.wolfLoader.load(() => {
      if (this.wolfLoader && this.wolfLoader.meshes.length > 0) {
        this.wolfMesh = this.wolfLoader.meshes[0];
        console.log("wolf mesh loaded:", this.wolfMesh.geometry.position.count, "vertices");
        console.log(this.wolfMesh);
      } else {
        console.log("wolf mesh loader has no meshes");
      }
    });

    
  // TEST: spawn a mob 2 units in front of player // DELETE
    this.mobs = [];
    // const forward = this.gui.getCamera().forward();
    // const spawnPos = new Vec3([
    //   this.playerPosition.x + forward.x*2, 
    //   this.playerPosition.y + forward.y*2, 
    //   this.playerPosition.z
    // ]);
    // this.mobs.push(new Mob(0, spawnPos, 0));
    // this.velocity = new Vec3();
    // this.lastTime = performance.now();
    // this.supported = true;
    // Testing 1 pink cube mob^
    

  }

  private updateChunkMap(chunkX: number, chunkY: number): void {

    // chunks in the player's 3x3 vicinity
    for (let i = chunkX - chunksToLoad; i <= chunkX + chunksToLoad; i++) {
      for (let j = chunkY - chunksToLoad; j <= chunkY + chunksToLoad; j++) {

        const key = getChunkKey(i, j);

        if (!this.chunks.has(key)) { // if the chunk has not already been generated
          this.chunks.set(key, new Chunk(i * chunkSize, j * chunkSize, chunkSize)); // create new chunk          
        }
      }
    } // at the end of this loop, we've added new chunks but have not deleted old ones

    for(const key of this.chunks.keys()){

      const [oldChunkX, oldChunkY] = key.split(", ").map(Number);

      if (Math.abs(oldChunkX - chunkX) > (chunksToLoad + 1) || Math.abs(oldChunkY - chunkY) > (chunksToLoad + 1)) {
        this.chunks.delete(key); // if the old chunk if farther than chunksToLoad + 1, delete it!
      }
    } // now we've deleted old ones that are far enough

    this.updateBuffers(); 
  }

  private updateBuffers(): void {
    this.totalNumCubes = 0;
    for (const chunk of this.chunks.values()) {
      this.totalNumCubes += chunk.numCubes();
    }

    this.cubePositionsF32 = new Float32Array(this.totalNumCubes * 4);
    this.cubeColorsF32 = new Float32Array(this.totalNumCubes * 3);
    this.cubeTypesF32 = new Float32Array(this.totalNumCubes);
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {
      this.gui.reset();
      this.playerPosition = this.gui.getCamera().pos();
      this.velocity = new Vec3();
      this.lastTime = performance.now();
      this.supported = true;
  }


  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
    this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
    this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
    this.blankCubeRenderPass.addInstancedAttribute("aColor", 3, this.ctx.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    this.blankCubeRenderPass.addInstancedAttribute("aCubeType", 1, this.ctx.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));

    this.blankCubeRenderPass.addUniform("uLightPos", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
      gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    this.blankCubeRenderPass.addUniform("uProj", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    this.blankCubeRenderPass.addUniform("uView", (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });

    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();
  }











  private updateMobVelocities(mobs: Mob[]){
    const player = this.playerPosition;
    for (const mob of mobs) {
      // direction in XZ plane - seek the player so should be PlayerPos - MobPos
      let dx = player.x - mob.center.x;
      let dz = player.z - mob.center.z; // remember [x, z, y]

      //let dy = player.y - mob.center.y;
      //dx += (Math.random() - 0.5) * 0.2;
      //dz += (Math.random() - 0.5) * 0.2; // make it more random

      const dist = Math.sqrt(dx*dx + dz*dz);

      if (dist < 20.0) continue;

      dx /= dist; // normalize
      //dy /= dist;
      dz /= dist;

      const speed = 0.05;
      const verticalVelocity = mob.velocity.y;
      mob.velocity = new Vec3([
        dx*speed, 
        verticalVelocity, 
        dz*speed,
      ]);

      // face movement direction with angular interpolation
      const targetAngle = Math.atan2(dz, dx);
      const angleDelta = Math.atan2(
        Math.sin(targetAngle - mob.orientation), 
        Math.cos(targetAngle - mob.orientation),
      );
      mob.orientation += 0.2 * angleDelta;
    }
  }

  private updateMobPositions(mobs: Mob[]){
    const gravity = 0.02;
    const terminalFallSpeed = -0.8;
    const mobRadius = 0.45;
    const mobHeight = 1.3;

    for (const mob of mobs) { // horizontal movement towards player
      mob.center.x += mob.velocity.x;
      //mob.center.y += mob.velocity.y;
      mob.center.z += mob.velocity.z;

      // gravity + ground collision
      mob.velocity.y = Math.max(mob.velocity.y - gravity, terminalFallSpeed);
      const nextY = mob.center.y + mob.velocity.y;
      let blocked = false;
      for (const chunk of this.chunks.values()){
        if (chunk.isColliding(mob.center.x, nextY, mob.center.z, mobRadius, mobHeight)) {
          blocked = true;
          break;
        }
      }

      if (blocked && mob.velocity.y <=0){
        mob.velocity.y = 0;
      } else{
        mob.center.y = nextY;
      }
    }
  }

  private updateMobBuffers() {
    const n = this.mobs.length;
    this.mobPositionsF32 = new Float32Array(n*4);
    this.mobColorsF32 = new Float32Array(n*3);

    for (let i = 0; i < n; i++) {
      const mob = this.mobs[i];
      this.mobPositionsF32.set([
        mob.center.x, 
        mob.center.y, 
        mob.center.z, 
        0
      ], i*4);
      this.mobColorsF32.set([
        1.0, 0.2, 0.8
      ], i*3);
    }
  }

  // rayIntersectAABB will be for enemy combat, 
  // if you click on an enemies bounding box, then you subtract one health point
  // consider deleting rayintersectaabb if this is imlplemented elsewhere
  private rayIntersectsAABB(rayOrigin: Vec3, rayDir: Vec3, boxMin: Vec3, boxMax: Vec3): boolean{
    let tmin = -Infinity;
    let tmax = Infinity;
    const axes = ['x', 'y', 'z'] as const;

    for (const axis of axes) {
      const o = rayOrigin[axis];
      const d = rayDir[axis];
      const min = boxMin[axis];
      const max = boxMax[axis];

      if (Math.abs(d) < 1e-6){
        if (o < min || o > max) return false;
      } else {
        let t1 = (min-o) / d;
        let t2 = (max-o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);

        if (tmin > tmax) return false;
      }
    }
    return tmax >=0;
  }

  public attack(): void {
    const rayOrigin = this.playerPosition;
    const rayDir = this.gui.getCamera().forward().copy().normalize();
    const reach = 3.0; // how far the player can hit - tweak this

    for (const mob of this.mobs){
      const halfSize = 10;
      const height = 10; // for determining bounding box, FIX

      const boxMin = new Vec3([
        mob.center.x - halfSize, 
        mob.center.y, 
        mob.center.z - halfSize
      ]);

      const boxMax = new Vec3([
        mob.center.x + halfSize, 
        mob.center.y + halfSize, 
        mob.center.z + height
      ]);

      if (this.rayIntersectsAABB(rayOrigin, rayDir, boxMin, boxMax)){

        //Check distance so you cant hit really far
        const dx = mob.center.x - rayOrigin.x; //[x, z, y]
        const dy = mob.center.y - rayOrigin.y; 
        const dz = mob.center.z - rayOrigin.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > reach) continue;

        mob.health -= 1; 
        console.log("Hit Mob! Mob health is: ", mob.health);

        if (mob.health <= 0){
          console.log("Mob dies!");
          this.mobs = this.mobs.filter(m => m !== mob); // delete mob?
        }

        break; // only one mob per click?
      }
    }
  }














  private pointInRect(mx: number, my: number, x: number, y: number, w: number, h: number): boolean {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  private clearSlot(slot: InventorySlot): void {
    slot.itemType = null;
    slot.count = 0;
  }

  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: 'full' | 'half' | 'empty'): void {
    ctx.save();
    ctx.translate(x, y);

    // Standard Heart Path
    const path = new Path2D();
    path.moveTo(size / 2, size * 0.25);
    path.bezierCurveTo(size / 2, 0, 0, 0, 0, size * 0.4);
    path.bezierCurveTo(0, size * 0.7, size / 2, size * 0.9, size / 2, size);
    path.bezierCurveTo(size / 2, size * 0.9, size, size * 0.7, size, size * 0.4);
    path.bezierCurveTo(size, 0, size / 2, 0, size / 2, size * 0.25);

    // Black outline/background
    ctx.fillStyle = "black";
    ctx.fill(path);
    
    // Shrink slightly for the inner color
    ctx.translate(1, 1);
    ctx.scale((size - 2) / size, (size - 2) / size);

    if (type === 'empty') {
      ctx.fillStyle = "#333333";
      ctx.fill(path);
    } else if (type === 'full') {
      ctx.fillStyle = "#ff1111";
      ctx.fill(path);
    } else if (type === 'half') {
      ctx.fillStyle = "#333333"; 
      ctx.fill(path);
      
      // Clip to only paint the left half red
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = "#ff1111";
      ctx.fillRect(0, 0, size / 2, size);
      ctx.restore();
    }

    ctx.restore();
  }

    private drawHealthBar(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const slotSize = this.SLOT_SIZE;
    const gap = this.GAP;
    const numSlots = 9;
    const hotbarWidth = (numSlots * slotSize) + ((numSlots - 1) * gap);
    
    const startX = (canvas.width - hotbarWidth) / 2;
    const hotbarY = canvas.height - 90; // Y-position of the closed hotbar

    const heartY = hotbarY - 24; // Just above the hotbar
    const heartSize = 16;
    const spacing = 18; 

    for (let i = 0; i < this.playerMaxHealth / 2; i++) {
      const x = startX + (i * spacing);
      
      let type: 'full' | 'half' | 'empty' = 'empty';
      if (this.playerHealth >= (i + 1) * 2) {
        type = 'full';
      } else if (this.playerHealth === (i * 2) + 1) {
        type = 'half';
      }

      this.drawHeart(context, x, heartY, heartSize, type);
    }
  }

  private getHoveredSlot(mx: number, my: number): SlotRef | null {
    const layout = this.getInventoryScreenLayout(this.canvas2d);
    const slotSize = this.SLOT_SIZE;
    const gap = this.GAP;

    // Check output
    if (this.pointInRect(mx, my, layout.crafting.outputRect.x, layout.crafting.outputRect.y, layout.crafting.outputRect.w, layout.crafting.outputRect.h)) {
      return { type: 'output', index: 0, slot: this.craftingOutputSlot };
    }

    // Check armor slots
    for (let i = 0; i < 4; i++) {
      const x = layout.armorStartX;
      const y = layout.armorStartY + i * (slotSize + gap);
      if (this.pointInRect(mx, my, x, y, slotSize, slotSize)) {
        return { type: 'armor', index: i, slot: this.armorSlots[i] };
      }
    }

    // Check crafting inputs
    for (let i = 0; i < layout.crafting.inputRects.length; i++) {
      const rect = layout.crafting.inputRects[i];
      if (this.pointInRect(mx, my, rect.x, rect.y, rect.w, rect.h)) {
        return { type: 'crafting', index: i, slot: this.craftingSlots[i] };
      }
    }

    // Check inventory grid
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) {
        const x = layout.inventoryStartX + col * (slotSize + gap);
        const y = layout.inventoryStartY + row * (slotSize + gap);
        if (this.pointInRect(mx, my, x, y, slotSize, slotSize)) {
          return { type: 'inventory', index: 9 + row * 9 + col, slot: this.inventory.slots[9 + row * 9 + col] };
        }
      }
    }

    // Check hotbar
    for (let col = 0; col < 9; col++) {
      const x = layout.inventoryStartX + col * (slotSize + gap);
      const y = layout.hotbarY;
      if (this.pointInRect(mx, my, x, y, slotSize, slotSize)) {
        return { type: 'inventory', index: col, slot: this.inventory.slots[col] };
      }
    }

    // Check if inside the main inventory panel (avatar, gaps between slots, etc.)
    if (this.pointInRect(mx, my, layout.panelX, layout.panelY, layout.panelW, layout.panelH)) {
      return { type: 'panel', index: -1, slot: null };
    }

    // If we reach here, we are truly outside the UI window (drop into world)
    return null;
  }

  public onInventoryMouseDown(button: number, shift: boolean, mx: number, my: number): void {
    const hovered = this.getHoveredSlot(mx, my);
    const held = this.heldItem;

    // Clicked completely outside UI bounds (Drop items)
    if (!hovered) {
      if (!isSlotEmpty(held)) {
        if (button === 0) {
          this.dropItem(held.itemType!, held.count);
          this.clearSlot(held);
        } else if (button === 2) {
          this.dropItem(held.itemType!, 1);
          held.count--;
          if (held.count === 0) this.clearSlot(held);
        }
      }
      return;
    }

    // Clicked inside the UI, but not on a slot (e.g., the avatar or background)
    if (hovered.type === 'panel') {
      return; // Do nothing. The item stays in your hand.
    }

    // Shift + Double Click (Consolidate items)
    const now = Date.now();
    if (shift && (now - this.lastClick.time < 300) && this.lastClick.slot === hovered.slot) {
      if (!isSlotEmpty(held)) this.consolidateItems(held.itemType!);
      return;
    }
    this.lastClick = { time: now, slot: hovered.slot };

    // Start Dragging (if holding an item)
    if (!isSlotEmpty(held) && hovered.type !== 'output') {
      this.dragState = {
        active: true,
        button: button,
        slots: new Set([hovered.slot!]),
        initialHandCount: held.count,
        initialHandType: held.itemType,
        originalSlotCounts: new Map([[hovered.slot!, hovered.slot!.count]])
      };
      return; // Do not apply the click yet; wait for mouseup or mousemove
    }

    // Standard Click (if hand is empty, pick up immediately)
    this.handleSlotClick(button, shift, hovered);
  }


  public onInventoryMouseMove(mx: number, my: number): void {
    if (!this.dragState || !this.dragState.active) return;

    const hovered = this.getHoveredSlot(mx, my);
    if (hovered && hovered.type !== 'output' && !this.dragState.slots.has(hovered.slot!)) {
      
      // Strict Armor Validation for drag painting
      if (hovered.type === 'armor') {
        const heldItemData = ITEM_DATA[this.dragState.initialHandType!];
        if (heldItemData.armorSlot === undefined || heldItemData.armorSlot !== hovered.index) {
          return; // Skip adding invalid armor slots to the drag chain
        }
      }

      const slot = hovered.slot!;
      if (isSlotEmpty(slot) || slot.itemType === this.dragState.initialHandType) {
        this.dragState.slots.add(slot);
        this.dragState.originalSlotCounts.set(slot, slot.count);
        this.distributeDrag();
      }
    }
  }

  public onInventoryMouseUp(): void {
    if (this.dragState) {
      // If we only clicked a single slot and released, it wasn't a drag. Treat as a standard click.
      if (this.dragState.slots.size === 1) {
        const mx = this.gui.getMouseX();
        const my = this.gui.getMouseY();
        const hovered = this.getHoveredSlot(mx, my);
        
        // Ensure hovered is not null AND not the background panel
        if (hovered && hovered.type !== 'panel') {
          this.handleSlotClick(this.dragState.button, false, hovered);
        }
      }
      this.dragState.active = false;
      this.dragState = null;
      this.evaluateCrafting();
    }
  }

  private handleSlotClick(button: number, shift: boolean, hovered: SlotRef): void {
    const slot = hovered.slot!;
    const held = this.heldItem;

    if (hovered.type === 'output') {
      this.takeCraftingOutput(shift);
      return;
    }

    // Strict Armor Validation for clicks
    if (hovered.type === 'armor' && !isSlotEmpty(held)) {
      const heldItemData = ITEM_DATA[held.itemType!];
      // Reject if item is not armor, or if it's the wrong armor type for this specific slot index
      if (heldItemData.armorSlot === undefined || heldItemData.armorSlot !== hovered.index) {
        return; 
      }
    }

    if (isSlotEmpty(held)) {
      if (isSlotEmpty(slot)) return;
      if (button === 0) { // Left: Take all
        held.itemType = slot.itemType; held.count = slot.count;
        this.clearSlot(slot);
      } else if (button === 2) { // Right: Take half
        held.itemType = slot.itemType;
        held.count = Math.ceil(slot.count / 2);
        slot.count -= held.count;
        if (slot.count === 0) this.clearSlot(slot);
      }
    } else {
      if (isSlotEmpty(slot)) {
        if (button === 0) { // Left: Place all
          slot.itemType = held.itemType; slot.count = held.count;
          this.clearSlot(held);
        } else if (button === 2) { // Right: Place 1
          slot.itemType = held.itemType;
          slot.count = 1;
          held.count--;
          if (held.count === 0) this.clearSlot(held);
        }
      } else if (slot.itemType === held.itemType) {
        const max = ITEM_DATA[slot.itemType!].maxStackSize;
        if (button === 0) { // Left: Fill stack
          const space = max - slot.count;
          const toAdd = Math.min(space, held.count);
          slot.count += toAdd;
          held.count -= toAdd;
          if (held.count === 0) this.clearSlot(held);
        } else if (button === 2 && slot.count < max) { // Right: Add 1
          slot.count++;
          held.count--;
          if (held.count === 0) this.clearSlot(held);
        }
      } else { // Swap
        const temp = { itemType: slot.itemType, count: slot.count };
        slot.itemType = held.itemType; slot.count = held.count;
        held.itemType = temp.itemType; held.count = temp.count;
      }
    }
    this.evaluateCrafting();
  }

  private distributeDrag(): void {
    if (!this.dragState) return;

    for (const [slot, count] of this.dragState.originalSlotCounts) {
      slot.count = count;
      if (count === 0) slot.itemType = null;
    }

    let remaining = this.dragState.initialHandCount;
    const slots = Array.from(this.dragState.slots);

    if (this.dragState.button === 2) { 
      for (const slot of slots) {
        if (remaining > 0) {
          slot.itemType = this.dragState.initialHandType;
          slot.count++;
          remaining--;
        }
      }
    } else { 
      const amountPerSlot = Math.floor(this.dragState.initialHandCount / slots.length);
      for (const slot of slots) {
        slot.itemType = this.dragState.initialHandType;
        slot.count += amountPerSlot;
        remaining -= amountPerSlot;
      }
    }

    this.heldItem.count = remaining;
    if (remaining === 0) this.heldItem.itemType = null;
  }

  private takeCraftingOutput(shift: boolean): void {
    if (isSlotEmpty(this.craftingOutputSlot)) return;

    const out = this.craftingOutputSlot;
    const held = this.heldItem;

    if (!isSlotEmpty(held) && (held.itemType !== out.itemType || held.count + out.count > ITEM_DATA[held.itemType!].maxStackSize)) {
      return; 
    }

    if (isSlotEmpty(held)) {
      held.itemType = out.itemType;
      held.count = out.count;
    } else {
      held.count += out.count;
    }

    for (const slot of this.craftingSlots) {
      if (!isSlotEmpty(slot)) {
        slot.count--;
        if (slot.count === 0) this.clearSlot(slot);
      }
    }
    this.evaluateCrafting();
  }

  private consolidateItems(type: itemTypeEnum): void {
    let targetIndex = 0;
    for (let i = this.inventory.slots.length - 1; i >= 0; i--) {
      const slot = this.inventory.slots[i];
      if (slot.itemType === type && i > targetIndex) {
        while (targetIndex < i) {
          const targetSlot = this.inventory.slots[targetIndex];
          if (isSlotEmpty(targetSlot) || (targetSlot.itemType === type && targetSlot.count < ITEM_DATA[type].maxStackSize)) {
            targetSlot.itemType = type;
            const space = ITEM_DATA[type].maxStackSize - targetSlot.count;
            const toMove = Math.min(space, slot.count);
            targetSlot.count += toMove;
            slot.count -= toMove;
            if (slot.count === 0) {
              this.clearSlot(slot);
              break;
            }
          } else {
            targetIndex++;
          }
        }
      }
    }
  }

  private dropItem(type: itemTypeEnum, count: number): void {
    console.log(`Dropped ${count}x ${ITEM_DATA[type].displayName} into the world`);
  }

  private evaluateCrafting(): void {
    this.clearSlot(this.craftingOutputSlot);
    
    let dirtCount = 0;
    for (const slot of this.craftingSlots) {
      if (slot.itemType === itemTypeEnum.DIRT_BLOCK) dirtCount++;
    }

    if (dirtCount === 4) {
      this.craftingOutputSlot.itemType = itemTypeEnum.CRAFTING_TABLE;
      this.craftingOutputSlot.count = 1;
    }
  }

  private returnCraftingItemsToInventory(): void {
    for (const slot of this.craftingSlots) {
      if (!isSlotEmpty(slot) && slot.itemType !== null) {
        addItem(this.inventory, slot.itemType, slot.count);
        this.clearSlot(slot);
      }
    }
    this.evaluateCrafting();
  }

  public onInventoryClosed(): void {
    this.returnCraftingItemsToInventory();
  }


  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.mobAnimationTime += dt * 1.5;
    
    // Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube.
    const walkDir = this.gui.walkDir();

    // Apply gravity if not supported (this.supported reflects last frame's ground state)
    if (!this.supported) {
      this.velocity.y -= 9.8 * dt;
    }
    
    // Handle horizontal movement
    const horizontalMove = new Vec3([walkDir.x, 0, walkDir.z]);
    const newPosXZ = this.playerPosition.copy().add(horizontalMove);
    
    let collisionXZ = false;
    for (const chunk of this.chunks.values()) {
      if (chunk.isColliding(newPosXZ.x, this.playerPosition.y, newPosXZ.z)) {
        collisionXZ = true;
        break;
      }
    }
    
    if (!collisionXZ) {
      this.playerPosition.x = newPosXZ.x;
      this.playerPosition.z = newPosXZ.z;
    }
    
    // Handle vertical movement
    const newPosY = this.playerPosition.y + this.velocity.y * dt;
    
    let collisionY = false;
    for (const chunk of this.chunks.values()) {
      if (chunk.isColliding(this.playerPosition.x, newPosY, this.playerPosition.z)) {// Check feet collision) {
        collisionY = true;
        break;
      }
    }
    
    if (!collisionY) {
      this.playerPosition.y = newPosY;
    } else {
      this.velocity.y = 0;
    }

    // Update supported state based on final position this frame
    let localSupported = false;
    for (const chunk of this.chunks.values()) {
      if (chunk.isColliding(this.playerPosition.x, this.playerPosition.y, this.playerPosition.z)) {
        localSupported = true;
        break;
      }
    }
    this.supported = localSupported;

    this.gui.getCamera().setPos(this.playerPosition);

    // check if we should generate new chunks based on player position
    // to be clear: the (x,y) chunk coordinates correspond to the x and z components of the player position (since y is height)
    const newChunkX = coordToChunk(this.playerPosition.x + chunkSize / 2);
    const newChunkY = coordToChunk(this.playerPosition.z + chunkSize / 2);

    if (newChunkX !== this.curChunkX || newChunkY !== this.curChunkY){
      this.curChunkX = newChunkX;
      this.curChunkY = newChunkY;
      this.updateChunkMap(newChunkX, newChunkY);
    }

    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, 1280, 960);
    
    this.drawHUD();
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);

    //TODO: Render multiple chunks around the player, using Perlin noise shaders
    // Concatenate the cube positions of all chunks
    let offsetPos = 0;
    let offsetCol = 0;
    let offsetType = 0;

    let allMobs: Mob[] = [...this.mobs]; // FIX: this is just for the one pink test mob for now - need to switch to mesh files later

    for(const chunk of this.chunks.values()){
      allMobs.push(...chunk.getMobs());

      let chunkPos = chunk.cubePositions();
      let chunkColors = chunk.cubeColors();
      let chunkTypes = chunk.cubeTypesFl();

      this.cubePositionsF32.set(chunkPos, offsetPos);
      this.cubeColorsF32.set(chunkColors, offsetCol);
      this.cubeTypesF32.set(chunkTypes, offsetType);

      offsetPos += chunkPos.length;
      offsetCol += chunkColors.length;
      offsetType += chunkTypes.length;
    }

    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.cubePositionsF32);
    this.blankCubeRenderPass.updateAttributeBuffer("aColor", this.cubeColorsF32);
    this.blankCubeRenderPass.updateAttributeBuffer("aCubeType", this.cubeTypesF32);
    this.blankCubeRenderPass.drawInstanced(this.totalNumCubes);


    // render mobs
    if (this.wolfMesh){
      // gather all mobs
      const allMobs: Mob[] = [...this.mobs];

      for (const chunk of this.chunks.values()){
        allMobs.push(...chunk.getMobs());
      }

      // simulate mobs on full list
      this.updateMobVelocities(allMobs);
      this.updateMobPositions(allMobs);

      // render
      const positions: Vec3[] = [];
      const rotations: Quat[] = [];
      for (const mob of allMobs){
        positions.push(mob.center);
        //const q = new Quat().setIdentity();
        const q = Quat.fromAxisAngle(new Vec3([0, 1, 0]), mob.orientation + this.WOLF_FACING_OFFSET);
        
        rotations.push(q);
      }
      this.drawMesh(this.wolfMesh, positions, rotations);
    }

  }

  private drawSlotContents(context: CanvasRenderingContext2D, slot: InventorySlot, x: number, y: number, slotSize: number): void {
    if (isSlotEmpty(slot) || slot.itemType === null) return;

    const itemData = ITEM_DATA[slot.itemType];
    const texturePath = itemData.texturePath;
    const countText = String(slot.count);

    if (texturePath) {
      const img = this.itemImages.get(texturePath);
      if (img && img.complete && img.naturalWidth > 0) {
        const padding = 6;
        const maxW = slotSize - 2 * padding;
        const maxH = slotSize - 2 * padding;

        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        //scale to fit within slot
        const scale = Math.min(maxW / imgW, maxH / imgH);
        const zoom = 2.3;
        const drawW = imgW * scale * zoom;
        const drawH = imgH * scale * zoom;

        //center inside slot
        const drawX = x + (slotSize - drawW) / 2;
        const drawY = y + (slotSize - drawH) / 2;

        context.drawImage(img, drawX, drawY, drawW, drawH);
        context.fillStyle = "white";
        context.textAlign = "right";
        context.textBaseline = "bottom";
        context.font = "12px sans-serif";
        context.fillText(countText, x + slotSize - 6, y + slotSize - 6);
        return;
      }
    }

    context.fillStyle = "white";
    context.textAlign = "center";

    context.font = "10px sans-serif";
    context.textBaseline = "top";
    context.fillText(itemData.displayName, x + slotSize / 2, y + 8);

    context.textBaseline = "bottom";
    context.font = "12px sans-serif";
    context.fillText(countText, x + slotSize / 2, y + slotSize - 6);
  }

  private drawInventorySlot(x: number, y: number, slotIndex: number, selected: number, context: CanvasRenderingContext2D, slotSize: number): void {
    const slot = this.inventory.slots[slotIndex];

    context.fillStyle = "rgba(0,0,0,0.5)";
    context.fillRect(x,y,slotSize,slotSize);
    context.lineWidth = (slotIndex === selected) ? 4 : 2;
    context.strokeStyle = (slotIndex === selected) ? "white" : "gray";
    context.strokeRect(x,y,slotSize, slotSize);
    this.drawSlotContents(context, slot, x, y, slotSize);
  }

  private drawHotbar(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const slotSize = 70;
    const gap = 6;
    const numSlots = 9;
    const hotbarWidth = (numSlots * slotSize) + ((numSlots - 1) * gap);
    const startX = (canvas.width - hotbarWidth) / 2;
    const y = canvas.height - 90;
    const selected = this.gui.getSelectedHotbarSlot();

    for (let i = 0; i < numSlots; i++) {
      const x = startX + i * (slotSize + gap);
      this.drawInventorySlot(x, y, i, selected, context, slotSize);
    }
  }

  private drawPanel(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = "rgba(45,45,45,0.94)", stroke = "rgba(180,180,180,0.9)"): void {
    context.save();
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, y, w, h, 12);
    context.fill();
    context.stroke();
    context.restore();
  }

  private drawSlotFrame(context: CanvasRenderingContext2D, x: number, y: number, size: number, selected: boolean = false): void {
    context.fillStyle = "rgba(20,20,20,0.9)";
    context.fillRect(x, y, size, size);
    context.lineWidth = selected ? 3 : 2;
    context.strokeStyle = selected ? "#ffffff" : "#8a8a8a";
    context.strokeRect(x, y, size, size);
    context.strokeStyle = "rgba(255,255,255,0.14)";
    context.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }

  private getInventoryScreenLayout(canvas: HTMLCanvasElement): InventoryScreenLayout {
    const slotSize = this.SLOT_SIZE;
    const gap = this.GAP;

    const inventoryCols = 9;
    const inventoryWidth = inventoryCols * slotSize + (inventoryCols - 1) * gap;

    const padding = 24;
    const panelW = inventoryWidth + padding * 2; 

    const armorW = slotSize;
    const avatarW = 120;
    const avatarH = 4 * slotSize + 3 * gap; 

    const craftingCols = 2;
    const craftingRows = 2;
    const craftingGridW = craftingCols * slotSize + (craftingCols - 1) * gap;
    const craftingGridH = craftingRows * slotSize + (craftingRows - 1) * gap;
    const arrowW = 40;
    const arrowGap = 16;
    const outputGap = 16;
    const craftingSectionW = craftingGridW + arrowGap + arrowW + outputGap + slotSize;

    const topHalfH = avatarH;
    const bottomHalfH = 4 * slotSize + 3 * gap + 18; 
    const panelH = padding + 24 + topHalfH + 30 + 24 + bottomHalfH + padding; 

    const panelX = (canvas.width - panelW) / 2;
    const panelY = (canvas.height - panelH) / 2;

    const topElementsW = armorW + gap + avatarW + 40 + craftingSectionW;
    const topStartX = panelX + (panelW - topElementsW) / 2;

    const armorStartX = topStartX;
    const armorStartY = panelY + padding + 24;

    const avatarX = armorStartX + armorW + gap;
    const avatarY = armorStartY;

    const craftingStartX = avatarX + avatarW + 40;
    const craftingStartY = armorStartY + (topHalfH - craftingGridH) / 2 + 10;

    const inputRects: { x: number; y: number; w: number; h: number }[] = [];
    for (let row = 0; row < craftingRows; row++) {
      for (let col = 0; col < craftingCols; col++) {
        inputRects.push({
          x: craftingStartX + col * (slotSize + gap),
          y: craftingStartY + row * (slotSize + gap),
          w: slotSize,
          h: slotSize
        });
      }
    }

    const outputRect = {
      x: craftingStartX + craftingGridW + arrowGap + arrowW + outputGap,
      y: craftingStartY + (craftingGridH - slotSize) / 2,
      w: slotSize,
      h: slotSize
    };

    const inventoryStartX = panelX + padding;
    const inventoryStartY = armorStartY + topHalfH + 30 + 24; 
    const hotbarY = inventoryStartY + 3 * (slotSize + gap) + 18;

    return {
      panelX, panelY, panelW, panelH,
      armorStartX, armorStartY,
      avatarX, avatarY, avatarW, avatarH,
      crafting: { inputRects, outputRect, cols: craftingCols, rows: craftingRows },
      inventoryStartX, inventoryStartY, hotbarY
    };
  }

  private drawPlayerAvatar(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.drawPanel(context, x, y, w, h, "rgba(28,28,28,0.92)", "rgba(140,140,140,0.9)");

    const cx = x + w / 2;
    const baseY = y + h - 22;
    
    // Mouse tracking math
    const mouseX = this.gui.getMouseX();
    const mouseY = this.gui.getMouseY();
    const dx = mouseX - cx;
    const dy = mouseY - (baseY - 126);
    const eyeOffX = Math.max(-2, Math.min(2, dx / 40));
    const eyeOffY = Math.max(-1, Math.min(2, dy / 40));

    // Body drawing
    context.fillStyle = "#6b4f2a"; context.fillRect(cx - 18, baseY - 148, 36, 10);
    context.fillStyle = "#d7ab84"; context.fillRect(cx - 18, baseY - 138, 36, 34);
    
    // Eyes (Whites & Tracking Pupils)
    context.fillStyle = "#ffffff"; 
    context.fillRect(cx - 12, baseY - 127, 7, 6); 
    context.fillRect(cx + 5, baseY - 127, 7, 6);
    
    context.fillStyle = "#3b2e88"; 
    context.fillRect(cx - 10 + eyeOffX, baseY - 126 + eyeOffY, 3, 4); 
    context.fillRect(cx + 7 + eyeOffX, baseY - 126 + eyeOffY, 3, 4);
    
    // Rest of body
    context.fillStyle = "#018883"; context.fillRect(cx - 18, baseY - 104, 36, 44);
    context.fillStyle = "#018883"; context.fillRect(cx - 34, baseY - 102, 14, 26); context.fillRect(cx + 20, baseY - 102, 14, 26);
    context.fillStyle = "#d7ab84"; context.fillRect(cx - 34, baseY - 76, 14, 34); context.fillRect(cx + 20, baseY - 76, 14, 34);
    context.fillStyle = "#3b2e88"; context.fillRect(cx - 18, baseY - 60, 15, 42); context.fillRect(cx + 3, baseY - 60, 15, 42);
    context.fillStyle = "#555";    context.fillRect(cx - 18, baseY - 18, 15, 8);  context.fillRect(cx + 3, baseY - 18, 15, 8);
  }

  private drawCraftingSection(context: CanvasRenderingContext2D, layout: CraftingLayout, title: string, slots: InventorySlot[]): void {
    const first = layout.inputRects[0];
    const last = layout.inputRects[layout.inputRects.length - 1];
    const gridX = first.x;
    const gridY = first.y;
    const gridW = (last.x - first.x) + last.w;
    const gridH = (last.y - first.y) + last.h;

    context.fillStyle = "white";
    context.font = "18px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(title, gridX, gridY - 12);

    for (let i = 0; i < layout.inputRects.length; i++) {
      const rect = layout.inputRects[i];
      this.drawSlotFrame(context, rect.x, rect.y, rect.w);
      this.drawSlotContents(context, slots[i], rect.x, rect.y, rect.w);
    }

    context.fillStyle = "white";
    context.font = "28px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("→", gridX + gridW + 18 + 20, gridY + gridH / 2);

    this.drawSlotFrame(context, layout.outputRect.x, layout.outputRect.y, layout.outputRect.w);
    this.drawSlotContents(context, this.craftingOutputSlot, layout.outputRect.x, layout.outputRect.y, layout.outputRect.w);
  }

  private drawInventoryGrid(context: CanvasRenderingContext2D, layout: InventoryScreenLayout): void {
    const selected = this.gui.getSelectedHotbarSlot();
    const slotSize = this.SLOT_SIZE;
    const gap = this.GAP;

    context.fillStyle = "white";
    context.font = "18px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText("Inventory", layout.inventoryStartX, layout.inventoryStartY - 10);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) {
        const slotIndex = 9 + row * 9 + col;
        const x = layout.inventoryStartX + col * (slotSize + gap);
        const y = layout.inventoryStartY + row * (slotSize + gap);
        this.drawInventorySlot(x, y, slotIndex, selected, context, slotSize);
      }
    }

    for (let col = 0; col < 9; col++) {
      const x = layout.inventoryStartX + col * (slotSize + gap);
      const y = layout.hotbarY;
      this.drawInventorySlot(x, y, col, selected, context, slotSize);
    }
  }

  private drawFullInventory(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const layout = this.getInventoryScreenLayout(canvas);
    this.drawPanel(context, layout.panelX, layout.panelY, layout.panelW, layout.panelH);
    
    // Draw Armor Column
    context.fillStyle = "white";
    context.font = "16px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText("Armor", layout.armorStartX + this.SLOT_SIZE / 2, layout.armorStartY - 10);

    for (let i = 0; i < 4; i++) {
      const x = layout.armorStartX;
      const y = layout.armorStartY + i * (this.SLOT_SIZE + this.GAP);
      this.drawSlotFrame(context, x, y, this.SLOT_SIZE);
      this.drawSlotContents(context, this.armorSlots[i], x, y, this.SLOT_SIZE);
    }

    this.drawPlayerAvatar(context, layout.avatarX, layout.avatarY, layout.avatarW, layout.avatarH);
    this.drawCraftingSection(context, layout.crafting, "Crafting", this.craftingSlots);
    this.drawInventoryGrid(context, layout);
  }

  private drawHeldItem(context: CanvasRenderingContext2D): void {
    if (isSlotEmpty(this.heldItem) || this.heldItem.itemType === null) return;

    const mouseX = this.gui.getMouseX();
    const mouseY = this.gui.getMouseY();
    const slotSize = 70;
    const x = mouseX - slotSize / 2;
    const y = mouseY - slotSize / 2;

    context.fillStyle = "rgba(0,0,0,0.65)";
    context.fillRect(x, y, slotSize, slotSize);
    context.lineWidth = 2;
    context.strokeStyle = "white";
    context.strokeRect(x, y, slotSize, slotSize);

    this.drawSlotContents(context, this.heldItem, x, y, slotSize);
  }

  private drawHUD(): void {
    const context = this.hudContext;
    const canvas = this.canvas2d;
    context.clearRect(0, 0, canvas.width, canvas.height);

    if (this.gui.isInventoryOpen()) {
      this.drawFullInventory(context, canvas);
    } else {
      this.drawHealthBar(context, canvas);
      this.drawHotbar(context, canvas);
    }
    
    this.drawHeldItem(context);
  }

  public getGUI(): GUI {
    return this.gui;
  }

  private buildMeshRenderPass(mesh: Mesh): { pass: RenderPass, indexCount: number } {
    const gl = this.ctx;
    const pass = new RenderPass(gl, meshVSText, meshFSText);
    const geo = mesh.geometry;

    const vertCount = geo.position.count;
    const indices = new Uint32Array(vertCount);
    for (let i = 0; i < vertCount; i++) indices[i] = i;
    pass.setIndexBufferData(indices);

    pass.addAttribute("aVertPos", 3, gl.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, geo.position.values);
    pass.addAttribute("aNorm", 3, gl.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, geo.normal.values);

    pass.addInstancedAttribute("aInstOffset", 3, gl.FLOAT, false,
      3 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
    pass.addInstancedAttribute("aInstRot", 4, gl.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));

    pass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    pass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    pass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });

    pass.setDrawData(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    pass.setup();
    return { pass, indexCount: indices.length };
  }

  // Draws a Collada mesh at a set of per-instance positions and rotations
  // using instanced rendering. positions[i] and rotations[i] form one instance.
  public drawMesh(mesh: Mesh, positions: Vec3[], rotations: Quat[]): void {
    const n = Math.min(positions.length, rotations.length);
    if (n === 0) return;

    let entry = this.meshRenderPasses.get(mesh);
    if (!entry) {
      entry = this.buildMeshRenderPass(mesh);
      this.meshRenderPasses.set(mesh, entry);
    }

    if (mesh.animations.length > 0) {
      const animatedPositions = this.computeAnimatedVertexPositions(mesh, this.mobAnimationTime, 0);
      entry.pass.updateAttributeBuffer("aVertPos", animatedPositions);
    }

    const offs = new Float32Array(n * 3);
    const rots = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      offs[3 * i]     = p.x;
      offs[3 * i + 1] = p.y;
      offs[3 * i + 2] = p.z;
      const q = rotations[i];
      rots[4 * i]     = q.x;
      rots[4 * i + 1] = q.y;
      rots[4 * i + 2] = q.z;
      rots[4 * i + 3] = q.w;
    }

    entry.pass.updateAttributeBuffer("aInstOffset", offs);
    entry.pass.updateAttributeBuffer("aInstRot", rots);

    // Collada meshes may have inconsistent/opposite winding vs. our CCW
    // convention, which would cause every triangle to be backface-culled
    // and the mesh to render completely invisible. Disable culling for
    // the mesh draw, then restore.
    const gl = this.ctx;
    gl.disable(gl.CULL_FACE);
    entry.pass.drawInstanced(n);
    gl.enable(gl.CULL_FACE);
  }


  
  private computeAnimatedVertexPositions(mesh: Mesh, time: number, clipIndex: number): Float32Array {
    const geo = mesh.geometry;
    const vertexCount = geo.position.count;
    const out = new Float32Array(vertexCount * 3);

    const skinMatrices = mesh.computeSkinMatrices(time, clipIndex);
    const boneMats: Mat4[] = [];
    for (let b = 0; b < mesh.bones.length; b++) {
      const o = b * 16;
      boneMats.push(new Mat4(Array.from(skinMatrices.subarray(o, o + 16))));
    }

    const vAttrs = [geo.v0.values, geo.v1.values, geo.v2.values, geo.v3.values];
    const skinIndex = geo.skinIndex.values;
    const skinWeight = geo.skinWeight.values;

    for (let i = 0; i < vertexCount; i++) {
      const i3 = 3 * i;
      const i4 = 4 * i;
      let px = 0;
      let py = 0;
      let pz = 0;
      let totalWeight = 0;

      for (let j = 0; j < 4; j++) {
        const w = skinWeight[i4 + j];
        if (w <= 0) continue;

        const boneIndex = Math.max(0, Math.min(mesh.bones.length - 1, Math.round(skinIndex[i4 + j])));
        const v = vAttrs[j];
        const transformed = boneMats[boneIndex].multiplyPt3(
          new Vec3([v[i3], v[i3 + 1], v[i3 + 2]]),
        );

        px += transformed.x * w;
        py += transformed.y * w;
        pz += transformed.z * w;
        totalWeight += w;
      }

      if (totalWeight > 0) {
        out[i3] = px / totalWeight;
        out[i3 + 1] = py / totalWeight;
        out[i3 + 2] = pz / totalWeight;
      } else {
        out[i3] = geo.position.values[i3];
        out[i3 + 1] = geo.position.values[i3 + 1];
        out[i3 + 2] = geo.position.values[i3 + 2];
      }
    }

    return out;
  }





  public jump() {
    // If the player is not already in the air, launch them upwards
    if (this.velocity.y === 0) {
      this.velocity.y = 10;
    }
  }

  // Debug: render a single cube type for icon screenshots.
  // To use, call this instead of the terrain init code in the constructor.
  private debugSingleCube(debugType: number): void {
    // this.renderDistance = 0;
    this.chunks = new Map<string, Chunk>();;
    this.totalNumCubes = 1;
    this.cubePositionsF32 = new Float32Array([0, 0, 0, 0]);
    const c = typeToColor[debugType];
    this.cubeColorsF32 = new Float32Array([c.x, c.y, c.z]);
    this.cubeTypesF32 = new Float32Array([debugType]);
    const d = 3.0;
    const camPos = new Vec3([-d * 0.707, d * 0.577, d * 0.707]);
    this.gui.setCamera(camPos, new Vec3([0, 0, 0]), new Vec3([0, 1, 0]), 45, 1280/960, 0.1, 1000.0);
    this.playerPosition = camPos;
    this.lightPosition = new Vec4([-800, 1000, 300, 1]);
    this.backgroundColor = new Vec4([0.0, 0.0, 0.0, 0.0]);
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();
}

export function coordToChunk(coord: number): number {
  return Math.floor(coord / chunkSize);
}

export function getChunkKey(x: number, y: number): string {
  return `${x}, ${y}`;
}
