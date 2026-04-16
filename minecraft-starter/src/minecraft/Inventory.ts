import { cubeTypeEnum } from "./Cube.js";

export enum itemTypeEnum {
    DIRT_BLOCK = 0,
    STONE_BLOCK = 1,
    SAND_BLOCK = 2,
    SNOW_BLOCK = 3,
    IRON_BLOCK = 4,
    GOLD_BLOCK = 5,
    DIAMOND_BLOCK = 6,
    EMERALD_BLOCK = 7,
    COAL_BLOCK = 8,
    GRAVEL_BLOCK = 9,

    STICK = 10,
    IRON_INGOT = 11,
    GOLD_INGOT = 12,
    CRAFTING_TABLE = 13,
    IRON_HELMET = 14,
    IRON_CHESTPLATE = 15,
    IRON_LEGGINGS = 16,
    IRON_BOOTS = 17,
}

export interface InventorySlot {
    itemType: itemTypeEnum | null;
    count: number;
}

export interface Inventory {
    slots: InventorySlot[];
    selectedHotbarIndex: number;
}

export interface ItemData {
  displayName: string;
  maxStackSize: number;
  placeable: boolean;
  placedCubeType: cubeTypeEnum | null;
  texturePath?: string;
  armorSlot?: number; // 0 = Helmet, 1 = Chestplate, 2 = Leggings, 3 = Boots
}

export const ITEM_DATA: Record<itemTypeEnum, ItemData> = {
    [itemTypeEnum.DIRT_BLOCK]: {
        displayName: "Dirt",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.DIRT,
        texturePath: "./assets/dirt_block.png",
    },
    [itemTypeEnum.STONE_BLOCK]: {
        displayName: "Stone",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.STONE,
        texturePath: "./assets/stone_block.png",
    },
    [itemTypeEnum.SAND_BLOCK]: {
        displayName: "Sand",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.SAND,
        texturePath: "./assets/sand_block.png",
    },
    [itemTypeEnum.SNOW_BLOCK]: {
        displayName: "Snow",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.SNOW,
        texturePath: "./assets/snow_block.png",
    },
    [itemTypeEnum.IRON_BLOCK]: {
        displayName: "Iron Block",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.IRON,
        texturePath: "./assets/iron_block.png",
    },
    [itemTypeEnum.GOLD_BLOCK]: {
        displayName: "Gold Block",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.GOLD,
        texturePath: "./assets/gold_block.png",
    },
    [itemTypeEnum.DIAMOND_BLOCK]: {
        displayName: "Diamond Block",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.DIAMOND,
        texturePath: "./assets/diamond_block.png",
    },
    [itemTypeEnum.EMERALD_BLOCK]: {
        displayName: "Emerald Block",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.EMERALD,
        texturePath: "./assets/emerald_block.png",
    },
    [itemTypeEnum.COAL_BLOCK]: {
        displayName: "Coal Block",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.COAL,
        texturePath: "./assets/coal_block.png",
    },
    [itemTypeEnum.GRAVEL_BLOCK]: {
        displayName: "Gravel",
        maxStackSize: 64,
        placeable: true,
        placedCubeType: cubeTypeEnum.GRAVEL,
        texturePath: "./assets/gravel_block.png",
    },

    [itemTypeEnum.STICK]: {
        displayName: "Stick",
        maxStackSize: 64,
        placeable: false,
        placedCubeType: null,
    },
    [itemTypeEnum.IRON_INGOT]: {
        displayName: "Iron Ingot",
        maxStackSize: 64,
        placeable: false,
        placedCubeType: null,
    },
    [itemTypeEnum.GOLD_INGOT]: {
        displayName: "Gold Ingot",
        maxStackSize: 64,
        placeable: false,
        placedCubeType: null,
    },
    [itemTypeEnum.CRAFTING_TABLE]: {
        displayName: "Crafting Table",
        maxStackSize: 1,
        placeable: false,
        placedCubeType: null,
    },
    [itemTypeEnum.IRON_HELMET]: {
        displayName: "Iron Helmet",
        maxStackSize: 1,
        placeable: false,
        placedCubeType: null,
        armorSlot: 0
    },
    [itemTypeEnum.IRON_CHESTPLATE]: {
        displayName: "Iron Chestplate",
        maxStackSize: 1,
        placeable: false,
        placedCubeType: null,
        armorSlot: 1
    },
    [itemTypeEnum.IRON_LEGGINGS]: {
        displayName: "Iron Leggings",
        maxStackSize: 1,
        placeable: false,
        placedCubeType: null,
        armorSlot: 2
    },
    [itemTypeEnum.IRON_BOOTS]: {
        displayName: "Iron Boots",
        maxStackSize: 1,
        placeable: false,
        placedCubeType: null,
        armorSlot: 3
    },
}

export function getHotbarItem(inventory: Inventory): InventorySlot | null {
    const slot = inventory.slots[inventory.selectedHotbarIndex];
    return isSlotEmpty(slot) ? null : slot;
}

export function makeEmptyInventory(numSlots: number = 36): Inventory {
    const slots: InventorySlot[] = [];
    for (let i = 0; i < numSlots; i++) {
        slots.push({itemType: null, count: 0});
    }
    
    return {slots, selectedHotbarIndex: 0};
}

export function isSlotEmpty(slot: InventorySlot): boolean {
    return slot.itemType === null || slot.count <= 0;
}

export function addItem(inventory: Inventory, itemType: itemTypeEnum, count: number): boolean {
    let remaining = count;
    const maxStack = ITEM_DATA[itemType].maxStackSize;

    //fill partial stacks
    for (const slot of inventory.slots) {
        if (slot.itemType === itemType && slot.count < maxStack) {
            const room = maxStack - slot.count;
            const toAdd = Math.min(room, remaining);
            slot.count += toAdd;
            remaining -= toAdd;

            if (remaining === 0) {
                return true;
            }
        }
    }

    //fill empty slots
    for (const slot of inventory.slots) {
        if (isSlotEmpty(slot)) {
            const toAdd = Math.min(maxStack, remaining);
            slot.itemType = itemType;
            slot.count = toAdd;
            remaining -= toAdd;

            if (remaining === 0) {
                return true;
            }
        }
    }

    return false;
}

export function countItem(inventory: Inventory, itemType: itemTypeEnum): number {
    let total = 0;
    for (const slot of inventory.slots) {
        if (slot.itemType === itemType) {
            total += slot.count;
        }
    }
    return total;
}

export function removeItem(inventory: Inventory, itemType: itemTypeEnum, count: number): boolean {
    if (countItem(inventory, itemType) < count) {
        return false;
    }

    let remaining = count;

    for (const slot of inventory.slots) {
        if (slot.itemType === itemType) {
            const toRemove = Math.min(slot.count, remaining);
            slot.count -= toRemove;
            remaining -= toRemove;

            if (slot.count <= 0) {
                slot.itemType = null;
                slot.count = 0;
            }

            if (remaining === 0) {
                return true;
            }
        }
    }

  return true;
}