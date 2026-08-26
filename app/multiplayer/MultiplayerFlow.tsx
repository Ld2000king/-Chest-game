"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CursedChestGame from "../game/CursedChestGame";
import { firebaseConfigured } from "./firebaseConfig";
import {
  addRoomBots,
  claimHostIfNeeded,
  createOnlineRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  listenToRoles,
  listenToRoom,
  normalizeNickname,
  normalizeRoomCode,
  publishRoomMatch,
  publishRoomMotion,
  removeRoomBot,
  removeRoomCommand,
  returnRoomToLobby,
  sendRoomCommand,
  setReady,
  setRoomSecretRole,
  startOnlineMatch,
} from "./firebaseClient";
import type { Role } from "../game/types";
import type { OnlineGameSession, OnlineRoom } from "./types";

type Language = "en" | "he";
type Intent = "create" | "join";

const copy = (language: Language, en: string, he: string) => language === "he" ? he : en;

function friendlyError(error: unknown, language: Language) {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes("firebase-not-configured")) return copy(language, "Firebase is waiting for configuration.", "Firebase ממתין להגדרה.");
  if (value.includes("PERMISSION_DENIED")) return copy(language, "Room access was denied. Check the room code and Firebase rules.", "הגישה לחדר נדחתה. בדקו את קוד החדר ואת כללי Firebase.");
  if (value.includes("invalid-room-code")) return copy(language, "Enter the complete 5-character room code.", "הזינו קוד חדר מלא בן 5 תווים.");
  if (value.includes("not-enough-players")) return copy(language, "At least 6 players are required. Add AI pirates to fill the crew.", "נדרשים לפחות 6 שחקנים. הוסיפו פיראטי AI לצוות.");
  if (value.includes("players-not-ready")) return copy(language, "Every connected player must be ready.", "כל השחקנים המחוברים חייבים להיות מוכנים.");
  return copy(language, "The sea is rough right now. Please try again.", "הים סוער כרגע. נסו שוב.");
}

export default function MultiplayerFlow({ initialIntent, onExit }: { initialIntent: Intent; onExit: () => void }) {
  const [language, setLanguage] = useState<Language>("en");
  const [intent, setIntent] = useState<Intent>(initialIntent);
  const [nickname, setNickname] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [roomKey, setRoomKey] = useState<{ code: string; uid: string } | null>(null);
  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [cursedTreasureId, setCursedTreasureId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hebrew = language === "he";
  const t = useCallback((en: string, he: string) => copy(language, en, he), [language]);

  const isHost = Boolean(roomKey && room?.hostId === roomKey.uid);
  const roomPlayers = useMemo(() => Object.values(room?.players || {}).sort((a, b) => a.joinedAt - b.joinedAt).map((player) => ({ ...player, host: player.uid === room?.hostId })), [room]);
  const localPlayer = roomPlayers.find((player) => player.uid === roomKey?.uid);

  useEffect(() => {
    if (!roomKey) return;
    const stop = listenToRoom(roomKey.code, (nextRoom) => {
      setRoom(nextRoom);
      if (!nextRoom) setError(t("This room no longer exists.", "החדר הזה כבר אינו קיים."));
    }, (reason) => setError(friendlyError(reason, language)));
    return stop;
  }, [language, roomKey, t]);

  useEffect(() => {
    if (!roomKey || !room) return;
    claimHostIfNeeded(roomKey.code, roomKey.uid, room).catch(() => undefined);
  }, [room, roomKey]);

  useEffect(() => {
    if (!roomKey || !room || room.status === "lobby") return;
    return listenToRoles(roomKey.code, roomKey.uid, isHost, setRoles, setCursedTreasureId);
  }, [isHost, room, roomKey]);

  const enterRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firebaseConfigured) {
      setError(t("Firebase configuration is not connected yet.", "הגדרת Firebase עדיין לא מחוברת."));
      return;
    }
    const safeNickname = normalizeNickname(nickname);
    if (!safeNickname) {
      setError(t("Choose a pirate nickname first.", "בחרו קודם כינוי פיראטי."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const key = intent === "create" ? await createOnlineRoom(safeNickname) : await joinOnlineRoom(codeInput, safeNickname);
      setRoomKey(key);
      window.localStorage.setItem("cursed-chest-online-room", JSON.stringify({ ...key, nickname: safeNickname }));
    } catch (reason) {
      setError(friendlyError(reason, language));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (roomKey) await leaveOnlineRoom(roomKey.code, roomKey.uid).catch(() => undefined);
    window.localStorage.removeItem("cursed-chest-online-room");
    onExit();
  };

  const fillCrew = async () => {
    if (!roomKey) return;
    setBusy(true);
    setError("");
    try {
      await addRoomBots(roomKey.code, Math.max(0, 8 - roomPlayers.length));
    } catch (reason) {
      setError(friendlyError(reason, language));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!roomKey) return;
    setBusy(true);
    setError("");
    try {
      await startOnlineMatch(roomKey.code);
    } catch (reason) {
      setError(friendlyError(reason, language));
    } finally {
      setBusy(false);
    }
  };

  const session = useMemo<OnlineGameSession | null>(() => {
    if (!roomKey || !room?.match || !localPlayer || !roles[roomKey.uid]) return null;
    return {
      code: roomKey.code,
      uid: roomKey.uid,
      nickname: localPlayer.nickname,
      isHost,
      roomPlayers,
      snapshot: room.match,
      motions: room.movement || {},
      roles,
      localRole: roles[roomKey.uid],
      cursedTreasureId,
      commands: Object.entries(room.commands || {}).map(([id, command]) => ({ id, ...command })),
      sendCommand: (type, payload = {}) => sendRoomCommand(roomKey.code, roomKey.uid, localPlayer.nickname, type, payload),
      publishMotion: (motion) => publishRoomMotion(roomKey.code, roomKey.uid, motion),
      publishMatch: (snapshot) => publishRoomMatch(roomKey.code, snapshot),
      removeCommand: (id) => removeRoomCommand(roomKey.code, id),
      setSecretRole: (uid, role) => setRoomSecretRole(roomKey.code, uid, role),
      returnToLobby: () => returnRoomToLobby(roomKey.code),
    };
  }, [cursedTreasureId, isHost, localPlayer, roles, room, roomKey, roomPlayers]);

  if (session && room?.status !== "lobby") return <CursedChestGame online={session} onExit={leave} initialLanguage={language} />;

  return (
    <main className={`launch-screen online-screen ${hebrew ? "rtl" : ""}`} dir={hebrew ? "rtl" : "ltr"} lang={language}>
      <button className="language-switch" onClick={() => setLanguage(hebrew ? "en" : "he")}><span>🌐</span>{hebrew ? "English" : "עברית"}</button>
      <div className="aurora aurora-gold" /><div className="aurora aurora-teal" />
      <section className="online-panel">
        <button className="online-back" type="button" onClick={leave}>‹ {t("Main menu", "תפריט ראשי")}</button>
        {!roomKey ? (
          <form className="online-entry" onSubmit={enterRoom}>
            <span className="online-icon">⚓</span>
            <p className="kicker">{t("ONLINE CREW", "צוות אונליין")}</p>
            <h2>{intent === "create" ? t("Create a room", "יצירת חדר") : t("Join a room", "הצטרפות לחדר")}</h2>
            <p>{t("Every device joins as a private anonymous Firebase player.", "כל מכשיר מצטרף כשחקן Firebase אנונימי ופרטי.")}</p>
            <label>{t("Pirate nickname", "כינוי פיראטי")}<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={18} autoComplete="nickname" placeholder={t("Captain Coral", "קפטן קורל")} /></label>
            {intent === "join" && <label>{t("Room code", "קוד חדר")}<input className="room-code-input" value={codeInput} onChange={(event) => setCodeInput(normalizeRoomCode(event.target.value))} maxLength={5} autoCapitalize="characters" placeholder="ABCDE" /></label>}
            {error && <div className="online-error" role="alert">⚠ {error}</div>}
            {!firebaseConfigured && <div className="online-config-note">{t("Online play will unlock after the Firebase values are added. Solo mode remains available.", "משחק אונליין ייפתח לאחר הוספת ערכי Firebase. מצב הסולו נשאר זמין.")}</div>}
            <button className="start-button" disabled={busy} type="submit"><span>{busy ? t("CONNECTING…", "מתחברים…") : intent === "create" ? t("CREATE ROOM", "יצירת חדר") : t("JOIN CREW", "הצטרפות לצוות")}</span><b>›</b></button>
            <button className="online-switch" type="button" onClick={() => { setIntent(intent === "create" ? "join" : "create"); setError(""); }}>{intent === "create" ? t("Have a code? Join a room", "יש לכם קוד? הצטרפו לחדר") : t("Need a room? Create one", "צריכים חדר? צרו אחד")}</button>
          </form>
        ) : (
          <div className="room-lobby">
            <p className="kicker">{t("CREW ASSEMBLY", "כינוס הצוות")}</p>
            <h2>{t("Multiplayer lobby", "לובי מרובה משתתפים")}</h2>
            <button className="room-code-card" type="button" onClick={async () => { await navigator.clipboard?.writeText(roomKey.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
              <small>{copied ? t("COPIED", "הועתק") : t("ROOM CODE · TAP TO COPY", "קוד חדר · לחצו להעתקה")}</small>
              <strong>{roomKey.code}</strong>
            </button>
            <div className="lobby-count"><span>{roomPlayers.length}/10</span>{t("pirates aboard", "פיראטים על הסיפון")}</div>
            <div className="online-roster">
              {roomPlayers.map((player) => <article key={player.uid} className={!player.connected ? "offline" : ""}>
                <span className="roster-avatar" style={{ background: player.color }}>☠</span>
                <div><strong>{player.nickname}</strong><small>{player.host ? t("HOST", "מארח") : player.isBot ? "AI BOT" : player.connected ? t("CONNECTED", "מחובר") : t("RECONNECTING", "מתחבר מחדש")}</small></div>
                <b className={player.ready ? "ready" : "waiting"}>{player.ready ? t("READY", "מוכן") : t("WAITING", "ממתין")}</b>
                {isHost && player.isBot && <button className="remove-bot" onClick={() => removeRoomBot(roomKey.code, player.uid)} aria-label={t("Remove bot", "הסרת בוט")}>×</button>}
              </article>)}
            </div>
            {error && <div className="online-error" role="alert">⚠ {error}</div>}
            <div className="lobby-actions">
              {!isHost && <button className={`ready-button ${localPlayer?.ready ? "active" : ""}`} onClick={() => localPlayer && setReady(roomKey.code, roomKey.uid, !localPlayer.ready)}>{localPlayer?.ready ? t("READY!", "מוכנים!") : t("I'M READY", "אני מוכן")}</button>}
              {isHost && <button className="ready-button" disabled={busy || roomPlayers.length >= 10} onClick={fillCrew}>{t("FILL TO 8 WITH AI", "מילוי ל־8 עם AI")}</button>}
              {isHost && <button className="start-button" disabled={busy || roomPlayers.length < 6 || roomPlayers.some((player) => !player.isBot && !player.ready)} onClick={start}><span>{t("START ONLINE RAID", "התחלת פשיטה אונליין")}</span><b>›</b></button>}
              {!isHost && <p className="host-wait">{t("The host starts when everyone is ready.", "המארח יתחיל כשכולם יהיו מוכנים.")}</p>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
