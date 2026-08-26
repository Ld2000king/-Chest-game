import type { BodyState, KeyState, Phase, PlayerState, Role, TaskState, TrapState, TreasureState } from "../game/types";

export type RoomStatus = "lobby" | "playing" | "ended";

export type OnlineRoomPlayer = {
  uid: string;
  nickname: string;
  color: string;
  ready: boolean;
  host: boolean;
  isBot: boolean;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
};

export type OnlineChatMessage = {
  id: string;
  senderId: string;
  sender: string;
  text: string;
  createdAt: number;
};

export type OnlineMeetingState = {
  id: string;
  bodyId: string;
  reporterId: string;
  reporterName: string;
  discussionEndsAt: number;
  voteEndsAt: number;
  status: "discussion" | "voting" | "results";
  messages: OnlineChatMessage[];
  votes: Record<string, string>;
  results: Record<string, number>;
  ejectedId: string | null;
  resolveAt: number;
  lastBotMessageAt: number;
};

export type OnlineEndState = {
  winner: "Pirates" | "Cursed Pirates";
  reason: "bell" | "curse" | "vote" | "disconnect";
  endedAt: number;
};

export type OnlineMatchSnapshot = {
  version: number;
  phase: Extract<Phase, "playing" | "meeting" | "ended">;
  startedAt: number;
  elapsed: number;
  players: PlayerState[];
  keys: KeyState[];
  tasks: TaskState[];
  bodies: BodyState[];
  traps: TrapState[];
  treasures: TreasureState[];
  treasureTakenBy: string | null;
  treasureTakenId: string | null;
  chestOpenedAt: number | null;
  fakeTasksByPlayer: Record<string, string[]>;
  cooldowns: Record<string, { killReadyAt: number; sabotageReadyAt: number }>;
  meeting: OnlineMeetingState | null;
  endState: OnlineEndState | null;
  updatedAt: number;
};

export type OnlineMotion = {
  x: number;
  y: number;
  moving: boolean;
  updatedAt: number;
};

export type OnlineCommandType =
  | "pickup-key"
  | "drop-key"
  | "deliver-key"
  | "finish-task"
  | "eliminate"
  | "sabotage"
  | "place-trap"
  | "report"
  | "meeting-chat"
  | "meeting-vote"
  | "choose-treasure"
  | "ring-bell";

export type OnlineCommand = {
  id: string;
  actorId: string;
  actorName: string;
  type: OnlineCommandType;
  payload: Record<string, string | number | boolean | null>;
  createdAt: number;
};

export type OnlineRoom = {
  code: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  maxPlayers: number;
  players: Record<string, OnlineRoomPlayer>;
  match?: OnlineMatchSnapshot | null;
  movement?: Record<string, OnlineMotion>;
  commands?: Record<string, Omit<OnlineCommand, "id">>;
};

export type OnlineGameSession = {
  code: string;
  uid: string;
  nickname: string;
  isHost: boolean;
  roomPlayers: OnlineRoomPlayer[];
  snapshot: OnlineMatchSnapshot;
  motions: Record<string, OnlineMotion>;
  roles: Record<string, Role>;
  localRole: Role;
  cursedTreasureId: string | null;
  commands: OnlineCommand[];
  sendCommand: (type: OnlineCommandType, payload?: OnlineCommand["payload"]) => Promise<void>;
  publishMotion: (motion: Omit<OnlineMotion, "updatedAt">) => Promise<void>;
  publishMatch: (snapshot: OnlineMatchSnapshot) => Promise<void>;
  removeCommand: (commandId: string) => Promise<void>;
  setSecretRole: (uid: string, role: Role) => Promise<void>;
  returnToLobby: () => Promise<void>;
};
