export type Role = "Pirate" | "Cursed Pirate";
export type Phase = "lobby" | "reveal" | "playing" | "meeting" | "treasure" | "ended";
export type TaskKind = "rope" | "cannonballs" | "map" | "wheel" | "coins" | "lock" | "lanterns" | "anchor" | "compass" | "supplies";

export type Point = { x: number; y: number };

export type PlayerState = Point & {
  id: string;
  name: string;
  color: string;
  role: Role;
  alive: boolean;
  isLocal?: boolean;
  carryingKeyId: string | null;
  target: Point;
  suspicion: number;
  isBot?: boolean;
};

export type KeyState = Point & {
  id: string;
  name: string;
  color: string;
  delivered: boolean;
  carrierId: string | null;
};

export type TaskState = Point & {
  id: string;
  title: string;
  short: string;
  area: string;
  kind: TaskKind;
  completed: boolean;
  sabotaged: boolean;
};

export type BodyState = Point & {
  id: string;
  playerId: string;
  playerName: string;
  color: string;
  reported: boolean;
};

export type TrapState = Point & { id: string; active: boolean };

export type TreasureState = {
  id: string;
  name: string;
  icon: string;
  description: string;
  cursed: boolean;
};
