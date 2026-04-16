import { Camera } from "../lib/webglutils/Camera.js";
import { Vec3 } from "../lib/TSM.js";
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */
export class GUI {
    /**
     *
     * @param canvas required to get the width and height of the canvas
     * @param animation required as a back pointer for some of the controls
     */
    constructor(canvas, animation) {
        this.Adown = false;
        this.Wdown = false;
        this.Sdown = false;
        this.Ddown = false;
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
    reset() {
        this.camera = new Camera(new Vec3([0, 130, 0]), new Vec3([0, 130, -1]), new Vec3([0, 1, 0]), 45, this.width / this.height, 0.1, 1000.0);
        this.selectedHotbarSlot = 0;
        this.inventoryOpen = false;
    }
    /**
     * Sets the GUI's camera to the given camera
     * @param cam a new camera
     */
    setCamera(pos, target, upDir, fov, aspect, zNear, zFar) {
        this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
    }
    /**
     * Returns the view matrix of the camera
     */
    viewMatrix() {
        return this.camera.viewMatrix();
    }
    /**
     * Returns the projection matrix of the camera
     */
    projMatrix() {
        return this.camera.projMatrix();
    }
    getCamera() {
        return this.camera;
    }
    getSelectedHotbarSlot() {
        return this.selectedHotbarSlot;
    }
    isInventoryOpen() {
        return this.inventoryOpen;
    }
    getMouseX() {
        return this.mouseX;
    }
    getMouseY() {
        return this.mouseY;
    }
    dragStart(mouse) {
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        this.dragging = true;
    }
    dragEnd(mouse) {
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
    drag(mouse) {
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
    onMouseDown(mouse) {
        this.mouseX = mouse.offsetX;
        this.mouseY = mouse.offsetY;
        if (this.inventoryOpen) {
            this.animation.onInventoryMouseDown(mouse.button, mouse.shiftKey, mouse.offsetX, mouse.offsetY);
            return;
        }
        this.dragStart(mouse);
    }
    walkDir() {
        let answer = new Vec3;
        if (this.Wdown)
            answer.add(this.camera.forward().negate());
        if (this.Adown)
            answer.add(this.camera.right().negate());
        if (this.Sdown)
            answer.add(this.camera.forward());
        if (this.Ddown)
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
    onKeydown(key) {
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
    onKeyup(key) {
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
    onWheel(event) {
        if (event.deltaY > 0) {
            this.selectedHotbarSlot = (this.selectedHotbarSlot + 1) % 9;
        }
        else if (event.deltaY < 0) {
            this.selectedHotbarSlot = (this.selectedHotbarSlot + 8) % 9;
        }
    }
    /**
     * Registers all event listeners for the GUI
     * @param canvas The canvas being used
     */
    registerEventListeners(canvas) {
        /* Event listener for key controls */
        window.addEventListener("keydown", (key) => this.onKeydown(key));
        window.addEventListener("keyup", (key) => this.onKeyup(key));
        /* Event listener for mouse controls */
        canvas.addEventListener("mousedown", (mouse) => this.onMouseDown(mouse));
        canvas.addEventListener("mousemove", (mouse) => this.drag(mouse));
        canvas.addEventListener("mouseup", (mouse) => this.dragEnd(mouse));
        canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
            this.onWheel(event);
        });
        canvas.addEventListener("click", (mouse) => {
            this.animation.attack();
        });
        /* Event listener to stop the right click menu */
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
}
GUI.rotationSpeed = 0.01;
GUI.walkSpeed = 1;
GUI.rollSpeed = 0.1;
GUI.panSpeed = 0.1;
//# sourceMappingURL=Gui.js.map