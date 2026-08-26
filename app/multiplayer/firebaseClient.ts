import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import {
  getDatabase,
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { CHEST, createKeys, createTasks, createTreasures, crewColors, crewNames } from "../game/data";
import type { PlayerState, Role } from "../game/types";
import { firebaseConfig, firebaseConfigured } from "./firebaseConfig";
import type { OnlineCommand, OnlineCommandType, OnlineMatchSnapshot, OnlineMotion, OnlineRoom, OnlineRoomPlayer } from "./types";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;

function services() {
  if (!firebaseConfigured) throw new Error("firebase-not-configured");
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getDatabase(app) };
}

function randomCode() {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function normalizeNickname(value: string) {
  return value.replace(/[<>\n\r]/g, "").trim().slice(0, 18);
}

export async function ensureAnonymousUser(): Promise<User> {
  const { auth } = services();
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      stop();
      resolve(user);
    }, reject);
  });
}

function roomPlayer(uid: string, nickname: string, index: number, host = false): OnlineRoomPlayer {
  const now = Date.now();
  return {
    uid,
    nickname,
    color: crewColors[index % crewColors.length],
    ready: host,
    host,
    isBot: false,
    connected: true,
    joinedAt: now,
    lastSeen: now,
  };
}

async function attachPresence(db: Database, code: string, uid: string) {
  const playerPath = ref(db, `rooms/${code}/players/${uid}`);
  const motionPath = ref(db, `rooms/${code}/movement/${uid}`);
  await onDisconnect(playerPath).update({ connected: false, lastSeen: serverTimestamp() });
  await onDisconnect(motionPath).remove();
}

export async function createOnlineRoom(nickname: string) {
  const user = await ensureAnonymousUser();
  const { db } = services();
  const safeName = normalizeNickname(nickname) || "Captain";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const now = Date.now();
    const player = roomPlayer(user.uid, safeName, 0, true);
    const room: OnlineRoom = {
      code,
      hostId: user.uid,
      status: "lobby",
      createdAt: now,
      maxPlayers: 10,
      players: { [user.uid]: player },
      match: null,
    };
    const result = await runTransaction(ref(db, `rooms/${code}`), (current) => current ? undefined : room, { applyLocally: false });
    if (!result.committed) continue;
    await attachPresence(db, code, user.uid);
    return { code, uid: user.uid };
  }
  throw new Error("room-code-unavailable");
}

export async function joinOnlineRoom(codeValue: string, nickname: string) {
  const user = await ensureAnonymousUser();
  const { db } = services();
  const code = normalizeRoomCode(codeValue);
  const safeName = normalizeNickname(nickname) || "Pirate";
  if (code.length !== ROOM_CODE_LENGTH) throw new Error("invalid-room-code");

  const player = roomPlayer(user.uid, safeName, Math.floor(Math.random() * crewColors.length));
  await set(ref(db, `rooms/${code}/players/${user.uid}`), player);
  await attachPresence(db, code, user.uid);
  return { code, uid: user.uid };
}

export function listenToRoom(code: string, onRoom: (room: OnlineRoom | null) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = services();
  return onValue(ref(db, `rooms/${code}`), (snapshot) => onRoom(snapshot.exists() ? snapshot.val() as OnlineRoom : null), (error) => onError(error));
}

export function listenToRoles(code: string, uid: string, host: boolean, onRoles: (roles: Record<string, Role>) => void, onCursedTreasure: (id: string | null) => void): Unsubscribe {
  const { db } = services();
  const path = host ? `roomSecrets/${code}` : `roomSecrets/${code}/roles/${uid}`;
  return onValue(ref(db, path), (snapshot) => {
    if (host) {
      const secret = snapshot.val() as { roles?: Record<string, Role>; cursedTreasureId?: string } | null;
      onRoles(secret?.roles || {});
      onCursedTreasure(secret?.cursedTreasureId || null);
    } else {
      onRoles(snapshot.exists() ? { [uid]: snapshot.val() as Role } : {});
      onCursedTreasure(null);
    }
  });
}

export async function setReady(code: string, uid: string, ready: boolean) {
  const { db } = services();
  await update(ref(db, `rooms/${code}/players/${uid}`), { ready, connected: true, lastSeen: serverTimestamp() });
}

export async function addRoomBots(code: string, count: number) {
  const user = await ensureAnonymousUser();
  const { db } = services();
  const roomSnapshot = await get(ref(db, `rooms/${code}`));
  const room = roomSnapshot.val() as OnlineRoom | null;
  if (!room || room.hostId !== user.uid || room.status !== "lobby") throw new Error("host-only");
  const currentPlayers = Object.values(room.players || {});
  const openSlots = Math.max(0, Math.min(count, room.maxPlayers - currentPlayers.length));
  const updates: Record<string, OnlineRoomPlayer> = {};
  for (let index = 0; index < openSlots; index += 1) {
    const botNumber = currentPlayers.filter((player) => player.isBot).length + index + 1;
    const uid = `bot-${botNumber}`;
    const now = Date.now();
    updates[uid] = {
      uid,
      nickname: crewNames[(botNumber - 1) % crewNames.length],
      color: crewColors[(currentPlayers.length + index) % crewColors.length],
      ready: true,
      host: false,
      isBot: true,
      connected: true,
      joinedAt: now + index,
      lastSeen: now,
    };
  }
  if (Object.keys(updates).length) await update(ref(db, `rooms/${code}/players`), updates);
}

export async function removeRoomBot(code: string, botId: string) {
  const { db } = services();
  await remove(ref(db, `rooms/${code}/players/${botId}`));
}

const spawnRing = [
  { x: 610, y: 470 }, { x: 545, y: 365 }, { x: 650, y: 340 }, { x: 755, y: 375 }, { x: 790, y: 470 },
  { x: 735, y: 555 }, { x: 625, y: 570 }, { x: 525, y: 525 }, { x: 505, y: 435 }, { x: 690, y: 515 },
];

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export async function startOnlineMatch(code: string) {
  const user = await ensureAnonymousUser();
  const { db } = services();
  const roomSnapshot = await get(ref(db, `rooms/${code}`));
  const room = roomSnapshot.val() as OnlineRoom | null;
  if (!room || room.hostId !== user.uid || room.status !== "lobby") throw new Error("host-only");
  const roster = Object.values(room.players || {}).filter((player) => player.isBot || player.connected).sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 10);
  if (roster.length < 6) throw new Error("not-enough-players");
  if (roster.some((player) => !player.isBot && !player.ready)) throw new Error("players-not-ready");

  const cursedCount = roster.length >= 8 ? 2 : 1;
  const cursedIds = new Set(shuffled(roster.map((player) => player.uid)).slice(0, cursedCount));
  const roles: Record<string, Role> = Object.fromEntries(roster.map((player) => [player.uid, cursedIds.has(player.uid) ? "Cursed Pirate" : "Pirate"]));
  const actualTreasures = createTreasures();
  const cursedTreasureId = actualTreasures.find((treasure) => treasure.cursed)?.id || actualTreasures[0].id;
  const now = Date.now();
  const players: PlayerState[] = roster.map((player, index) => ({
    id: player.uid,
    name: player.nickname,
    color: player.color,
    role: "Pirate",
    alive: true,
    isLocal: false,
    isBot: player.isBot,
    carryingKeyId: null,
    target: spawnRing[index % spawnRing.length],
    suspicion: 0,
    ...spawnRing[index % spawnRing.length],
  }));
  const match: OnlineMatchSnapshot = {
    version: 1,
    phase: "playing",
    startedAt: now,
    elapsed: 0,
    players,
    keys: createKeys(),
    tasks: createTasks(),
    bodies: [],
    traps: [],
    treasures: actualTreasures.map((treasure) => ({ ...treasure, cursed: false })),
    treasureTakenBy: null,
    treasureTakenId: null,
    chestOpenedAt: null,
    fakeTasksByPlayer: {},
    cooldowns: {},
    meeting: null,
    endState: null,
    updatedAt: now,
  };

  await set(ref(db, `roomSecrets/${code}`), { roles, cursedTreasureId, createdAt: now });
  const movement = Object.fromEntries(players.map((player) => [player.id, { x: player.x, y: player.y, moving: false, updatedAt: now }]));
  await update(ref(db, `rooms/${code}`), { status: "playing", match, movement, commands: null });
}

export async function sendRoomCommand(code: string, actorId: string, actorName: string, type: OnlineCommandType, payload: OnlineCommand["payload"] = {}) {
  const { db } = services();
  const command = push(ref(db, `rooms/${code}/commands`));
  await set(command, { actorId, actorName, type, payload, createdAt: serverTimestamp() });
}

export async function publishRoomMotion(code: string, uid: string, motion: Omit<OnlineMotion, "updatedAt">) {
  const { db } = services();
  await set(ref(db, `rooms/${code}/movement/${uid}`), { ...motion, updatedAt: serverTimestamp() });
}

export async function publishRoomMatch(code: string, snapshot: OnlineMatchSnapshot) {
  const { db } = services();
  await set(ref(db, `rooms/${code}/match`), snapshot);
  if (snapshot.phase === "ended") await set(ref(db, `rooms/${code}/status`), "ended");
}

export async function removeRoomCommand(code: string, commandId: string) {
  const { db } = services();
  await remove(ref(db, `rooms/${code}/commands/${commandId}`));
}

export async function setRoomSecretRole(code: string, uid: string, role: Role) {
  const { db } = services();
  await set(ref(db, `roomSecrets/${code}/roles/${uid}`), role);
}

export async function returnRoomToLobby(code: string) {
  const { db } = services();
  await update(ref(db, `rooms/${code}`), { status: "lobby", match: null, movement: null, commands: null });
  await remove(ref(db, `roomSecrets/${code}`));
}

export async function leaveOnlineRoom(code: string, uid: string) {
  const { db } = services();
  await update(ref(db, `rooms/${code}/players/${uid}`), { connected: false, ready: false, lastSeen: serverTimestamp() });
  await remove(ref(db, `rooms/${code}/movement/${uid}`));
}

export async function claimHostIfNeeded(code: string, uid: string, room: OnlineRoom) {
  const currentHost = room.players?.[room.hostId];
  if (currentHost?.connected) return;
  const nextHost = Object.values(room.players || {}).filter((player) => !player.isBot && player.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!nextHost || nextHost.uid !== uid) return;
  const { db } = services();
  await update(ref(db, `rooms/${code}`), { hostId: uid });
  await update(ref(db, `rooms/${code}/players/${uid}`), { host: true, ready: true });
}

export function publicMatchSnapshot(snapshot: OnlineMatchSnapshot): OnlineMatchSnapshot {
  return {
    ...snapshot,
    players: snapshot.players.map((player) => ({ ...player, role: "Pirate", isLocal: false })),
    treasures: snapshot.treasures.map((treasure) => ({ ...treasure, cursed: false })),
    updatedAt: Date.now(),
  };
}

export function nearChest(player: PlayerState) {
  return Math.hypot(player.x - CHEST.x, player.y - CHEST.y) < 95;
}
