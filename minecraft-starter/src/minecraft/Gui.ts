import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { MinecraftAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.01;
  private static readonly walkSpeed: number = 1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera!: Camera;
  private prevX: number;
  private prevY: number;
  private dragging: boolean;

  private height: number;
  private width: number;

  private animation: MinecraftAnimation;

  private Adown: boolean = false;
  private Wdown: boolean = false;
  private Sdown: boolean = false;
  private Ddown: boolean = false;

  private selectedHotbarSlot!: number;
  private inventoryOpen!: boolean;

  private mouseX: number;
  private mouseY: number;

  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: MinecraftAnimation) {
    this.height = canvas.height;
    this.width = canvas.width;
    this.prevX = 0;
    this.prevY = 0;
    this.dragging = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.animation = animation;
    this.reset();
    this.registerEventListeners(canvas);
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.camera = new Camera(
      new Vec3([0, 130, 0]),
      new Vec3([0, 130, -1]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.height,
      0.1,
      1000.0
    );
    this.selectedHotbarSlot = 0;
    this.inventoryOpen = false;
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }
  
  public getCamera(): Camera {
    return this.camera;
  }

  public getSelectedHotbarSlot(): number {
    return this.selectedHotbarSlot;
  }

  public isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  public getMouseX(): number {
    return this.mouseX;
  }

  public getMouseY(): number {
    return this.mouseY;
  }
  
  public dragStart(mouse: MouseEvent): void {
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
    this.dragging = true;
  }

  public dragEnd(mouse: MouseEvent): void {
    if (this.inventoryOpen) {
      this.animation.onInventoryMouseUp();
      return;
    }
    this.dragging = false;
  }
  
  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    this.mouseX = mouse.offsetX;
    this.mouseY = mouse.offsetY;

    if (this.inventoryOpen) {
      this.animation.onInventoryMouseMove(mouse.offsetX, mouse.offsetY);
      return;
    }

    const dx = mouse.screenX - this.prevX;
    const dy = mouse.screenY - this.prevY;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;

    if (this.dragging) {
      this.camera.rotate(new Vec3([0, 1, 0]), -GUI.rotationSpeed * dx);
      this.camera.rotate(this.camera.right(), -GUI.rotationSpeed * dy);
    }
  }

  public onMouseDown(mouse: MouseEvent): void {
    this.mouseX = mouse.offsetX;
    this.mouseY = mouse.offsetY;

    if (this.inventoryOpen) {
      this.animation.onInventoryMouseDown(mouse.button, mouse.shiftKey, mouse.offsetX, mouse.offsetY);
      return;
    }
    this.dragStart(mouse);
  }
  
  public walkDir(): Vec3
  {
      let answer = new Vec3;
      if(this.Wdown)
        answer.add(this.camera.forward().negate());
      if(this.Adown)
        answer.add(this.camera.right().negate());
      if(this.Sdown)
        answer.add(this.camera.forward());
      if(this.Ddown)
        answer.add(this.camera.right());
      answer.y = 0;
      if (answer.x !== 0 || answer.z !== 0) {
        answer.normalize();
      }
      return answer;
  }
  
  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": {
        this.Wdown = true;
        break;
      }
      case "KeyA": {
        this.Adown = true;
        break;
      }
      case "KeyS": {
        this.Sdown = true;
        break;
      }
      case "KeyD": {
        this.Ddown = true;
        break;
      }
      case "KeyR": {
        this.animation.reset();
        break;
      }
      case "KeyE": {
        if (this.inventoryOpen) {
          this.animation.onInventoryClosed();
        }
        this.inventoryOpen = !this.inventoryOpen;
        this.dragging = false;
        break;
      }
      case "Space": {
        this.animation.jump();
        break;
      }
      //number keys select hotbar slots
      case "Digit1": {
        this.selectedHotbarSlot = 0;
        break;
      }
      case "Digit2": {
        this.selectedHotbarSlot = 1;
        break;
      }
      case "Digit3": {
        this.selectedHotbarSlot = 2;
        break;
      }
      case "Digit4": {
        this.selectedHotbarSlot = 3;
        break;
      }
      case "Digit5": {
        this.selectedHotbarSlot = 4;
        break;
      }
      case "Digit6": {
        this.selectedHotbarSlot = 5;
        break;
      }
      case "Digit7": {
        this.selectedHotbarSlot = 6;
        break;
      }
      case "Digit8": {
        this.selectedHotbarSlot = 7;
        break;
      }
      case "Digit9": {
        this.selectedHotbarSlot = 8;
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }
  
  public onKeyup(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": {
        this.Wdown = false;
        break;
      }
      case "KeyA": {
        this.Adown = false;
        break;
      }
      case "KeyS": {
        this.Sdown = false;
        break;
      }
      case "KeyD": {
        this.Ddown = false;
        break;
      }
    }
  }  

  public onWheel(event: WheelEvent): void {
    if (event.deltaY > 0) {
      this.selectedHotbarSlot = (this.selectedHotbarSlot + 1) % 9;
    } else if (event.deltaY < 0) {
      this.selectedHotbarSlot = (this.selectedHotbarSlot + 8) % 9;
    }
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );
    
    window.addEventListener("keyup", (key: KeyboardEvent) =>
      this.onKeyup(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.onMouseDown(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    canvas.addEventListener("wheel", (event: WheelEvent) => {
      event.preventDefault();
      this.onWheel(event);
    });

    canvas.addEventListener("click", (mouse: MouseEvent) => {
      this.animation.attack();
    });
    
    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }
}
