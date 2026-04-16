import { cubeTypeEnum } from "./Cube.js";
export var itemTypeEnum;
(function (itemTypeEnum) {
    itemTypeEnum[itemTypeEnum["DIRT_BLOCK"] = 0] = "DIRT_BLOCK";
    itemTypeEnum[itemTypeEnum["STONE_BLOCK"] = 1] = "STONE_BLOCK";
    itemTypeEnum[itemTypeEnum["SAND_BLOCK"] = 2] = "SAND_BLOCK";
    itemTypeEnum[itemTypeEnum["SNOW_BLOCK"] = 3] = "SNOW_BLOCK";
    itemTypeEnum[itemTypeEnum["IRON_BLOCK"] = 4] = "IRON_BLOCK";
    itemTypeEnum[itemTypeEnum["GOLD_BLOCK"] = 5] = "GOLD_BLOCK";
    itemTypeEnum[itemTypeEnum["DIAMOND_BLOCK"] = 6] = "DIAMOND_BLOCK";
    itemTypeEnum[itemTypeEnum["EMERALD_BLOCK"] = 7] = "EMERALD_BLOCK";
    itemTypeEnum[itemTypeEnum["COAL_BLOCK"] = 8] = "COAL_BLOCK";
    itemTypeEnum[itemTypeEnum["GRAVEL_BLOCK"] = 9] = "GRAVEL_BLOCK";
    itemTypeEnum[itemTypeEnum["STICK"] = 10] = "STICK";
    itemTypeEnum[itemTypeEnum["IRON_INGOT"] = 11] = "IRON_INGOT";
    itemTypeEnum[itemTypeEnum["GOLD_INGOT"] = 12] = "GOLD_INGOT";
    itemTypeEnum[itemTypeEnum["CRAFTING_TABLE"] = 13] = "CRAFTING_TABLE";
    itemTypeEnum[itemTypeEnum["IRON_HELMET"] = 14] = "IRON_HELMET";
    itemTypeEnum[itemTypeEnum["IRON_CHESTPLATE"] = 15] = "IRON_CHESTPLATE";
    itemTypeEnum[itemTypeEnum["IRON_LEGGINGS"] = 16] = "IRON_LEGGINGS";
    itemTypeEnum[itemTypeEnum["IRON_BOOTS"] = 17] = "IRON_BOOTS";
})(itemTypeEnum || (itemTypeEnum = {}));
export const ITEM_DATA = {
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
};
export function getHotbarItem(inventory) {
    const slot = inventory.slots[inventory.selectedHotbarIndex];
    return isSlotEmpty(slot) ? null : slot;
}
export function makeEmptyInventory(numSlots = 36) {
    const slots = [];
    for (let i = 0; i < numSlots; i++) {
        slots.push({ itemType: null, count: 0 });
    }
    return { slots, selectedHotbarIndex: 0 };
}
export function isSlotEmpty(slot) {
    return slot.itemType === null || slot.count <= 0;
}
export function addItem(inventory, itemType, count) {
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
export function countItem(inventory, itemType) {
    let total = 0;
    for (const slot of inventory.slots) {
        if (slot.itemType === itemType) {
            total += slot.count;
        }
    }
    return total;
}
export function removeItem(inventory, itemType, count) {
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
//# sourceMappingURL=Inventory.js.map