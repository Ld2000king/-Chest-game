import type { KeyState, PlayerState, TaskState, TreasureState } from "./types";

export const WORLD = { width: 1900, height: 1300 };
export const CHEST = { x: 650, y: 430 };
export const BELL = { x: 280, y: 165 };

export const crewNames = ["Bonny", "Hooks", "Mako", "Nibs", "Pearl", "Rook", "Skiff", "Tide", "Wren"];
export const crewColors = ["#d55b50", "#3d8f85", "#d79b35", "#6d78bd", "#b15f91", "#59915d", "#d77945", "#4f91b5", "#9a7148"];

export function createPlayers(count = 8): PlayerState[] {
  const cursedIndex = 1 + Math.floor(Math.random() * (count - 1));
  const spawnRing = [
    { x: 545, y: 365 }, { x: 650, y: 340 }, { x: 755, y: 375 }, { x: 790, y: 470 },
    { x: 735, y: 555 }, { x: 625, y: 570 }, { x: 525, y: 525 }, { x: 505, y: 435 },
  ];
  return Array.from({ length: count }, (_, index) => {
    const isLocal = index === 0;
    const start = isLocal ? { x: 610, y: 470 } : spawnRing[(index - 1) % spawnRing.length];
    return {
      id: `player-${index}`,
      name: isLocal ? "You" : crewNames[index - 1],
      color: crewColors[index],
      role: index === cursedIndex || (isLocal && Math.random() < 0.2) ? "Cursed Pirate" : "Pirate",
      alive: true,
      isLocal,
      carryingKeyId: null,
      target: start,
      suspicion: 0,
      ...start,
    };
  });
}

export function createKeys(): KeyState[] {
  return [
    { id: "key-tide", name: "Tide Key", color: "#5cc6bd", x: 230, y: 225, delivered: false, carrierId: null },
    { id: "key-sun", name: "Sun Key", color: "#f1b94d", x: 110, y: 455, delivered: false, carrierId: null },
    { id: "key-bone", name: "Bone Key", color: "#e9dfb5", x: 445, y: 460, delivered: false, carrierId: null },
    { id: "key-ember", name: "Ember Key", color: "#df7253", x: 1015, y: 250, delivered: false, carrierId: null },
    { id: "key-moon", name: "Moon Key", color: "#8b86d8", x: 1740, y: 1120, delivered: false, carrierId: null },
  ];
}

export function createTasks(): TaskState[] {
  return [
    { id: "task-rope", title: "Repair the rigging", short: "Repair rope", area: "Ship Deck", kind: "rope", x: 420, y: 155, completed: false, sabotaged: false },
    { id: "task-cannon", title: "Stack the cannonballs", short: "Arrange cannonballs", area: "Storage", kind: "cannonballs", x: 470, y: 430, completed: false, sabotaged: false },
    { id: "task-map", title: "Restore the treasure map", short: "Rotate map pieces", area: "Captain's Cabin", kind: "map", x: 170, y: 405, completed: false, sabotaged: false },
    { id: "task-wheel", title: "True the ship wheel", short: "Repair ship wheel", area: "Ship Deck", kind: "wheel", x: 300, y: 210, completed: false, sabotaged: false },
    { id: "task-coins", title: "Gather the loose doubloons", short: "Collect coins", area: "Beach", kind: "coins", x: 870, y: 680, completed: false, sabotaged: false },
    { id: "task-lock", title: "Release the cave lock", short: "Unlock mechanism", area: "Cave", kind: "lock", x: 1050, y: 330, completed: false, sabotaged: false },
    { id: "task-lanterns", title: "Light the harbor signals", short: "Light lanterns", area: "Smuggler's Dock", kind: "lanterns", x: 1605, y: 1040, completed: false, sabotaged: false },
    { id: "task-anchor", title: "Raise the old anchor", short: "Raise anchor", area: "Smuggler's Dock", kind: "anchor", x: 1770, y: 1150, completed: false, sabotaged: false },
    { id: "task-compass", title: "Calibrate the lookout compass", short: "Tune compass", area: "Clifftop Lookout", kind: "compass", x: 1510, y: 510, completed: false, sabotaged: false },
    { id: "task-supplies", title: "Sort the stolen supplies", short: "Sort supplies", area: "Jungle Camp", kind: "supplies", x: 1435, y: 740, completed: false, sabotaged: false },
  ];
}

export function createTreasures(): TreasureState[] {
  const items = [
    { id: "crown", name: "Drowned Crown", icon: "♛", description: "A crown that hums with old sea songs." },
    { id: "pearl", name: "Moon Pearl", icon: "●", description: "A pearl lit by a cold inner moon." },
    { id: "compass", name: "Star Compass", icon: "✦", description: "Its needle points toward desire." },
  ];
  const cursed = Math.floor(Math.random() * items.length);
  return items.map((item, index) => ({ ...item, cursed: index === cursed }));
}
