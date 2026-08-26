"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BELL, CHEST, WORLD, createKeys, createPlayers, createTasks, createTreasures } from "./data";
import type { BodyState, KeyState, Phase, PlayerState, Point, TaskKind, TaskState, TrapState, TreasureState } from "./types";
import { publicMatchSnapshot } from "../multiplayer/firebaseClient";
import type { OnlineCommand, OnlineGameSession, OnlineMatchSnapshot, OnlineMeetingState } from "../multiplayer/types";

const LOCAL_ID = "player-0";
type Language = "en" | "he";

const ui = (language: Language, english: string, hebrew: string) => language === "he" ? hebrew : english;
const keyName = (id: string, language: Language) => ({
  "key-tide": ui(language, "Tide Key", "מפתח הגאות"),
  "key-sun": ui(language, "Sun Key", "מפתח השמש"),
  "key-bone": ui(language, "Bone Key", "מפתח העצם"),
  "key-ember": ui(language, "Ember Key", "מפתח הגחלת"),
  "key-moon": ui(language, "Moon Key", "מפתח הירח"),
}[id] || id);
const taskCopy = (id: string, language: Language) => ({
  "task-rope": { title: ui(language, "Repair the rigging", "תקנו את החבלים"), short: ui(language, "Repair rope", "תיקון חבל"), area: ui(language, "Ship Deck", "סיפון הספינה") },
  "task-cannon": { title: ui(language, "Stack the cannonballs", "סדרו את כדורי התותח"), short: ui(language, "Arrange cannonballs", "סידור כדורים"), area: ui(language, "Storage", "מחסן") },
  "task-map": { title: ui(language, "Restore the treasure map", "שחזרו את מפת האוצר"), short: ui(language, "Rotate map pieces", "סיבוב חלקי מפה"), area: ui(language, "Captain's Cabin", "תא הקפטן") },
  "task-wheel": { title: ui(language, "True the ship wheel", "תקנו את הגה הספינה"), short: ui(language, "Repair ship wheel", "תיקון ההגה"), area: ui(language, "Ship Deck", "סיפון הספינה") },
  "task-coins": { title: ui(language, "Gather the loose doubloons", "אספו את המטבעות"), short: ui(language, "Collect coins", "איסוף מטבעות"), area: ui(language, "Beach", "חוף") },
  "task-lock": { title: ui(language, "Release the cave lock", "פתחו את מנגנון המערה"), short: ui(language, "Unlock mechanism", "פתיחת מנגנון"), area: ui(language, "Cave", "מערה") },
  "task-lanterns": { title: ui(language, "Light the harbor signals", "הדליקו את פנסי הנמל"), short: ui(language, "Light lanterns", "הדלקת פנסים"), area: ui(language, "Smuggler's Dock", "רציף המבריחים") },
  "task-anchor": { title: ui(language, "Raise the old anchor", "הרימו את העוגן הישן"), short: ui(language, "Raise anchor", "הרמת עוגן"), area: ui(language, "Smuggler's Dock", "רציף המבריחים") },
  "task-compass": { title: ui(language, "Calibrate the lookout compass", "כוונו את מצפן התצפית"), short: ui(language, "Tune compass", "כיוון מצפן"), area: ui(language, "Clifftop Lookout", "מצפור הצוק") },
  "task-supplies": { title: ui(language, "Sort the stolen supplies", "מיינו את האספקה הגנובה"), short: ui(language, "Sort supplies", "מיון אספקה"), area: ui(language, "Jungle Camp", "מחנה הג׳ונגל") },
}[id] || { title: id, short: id, area: "" });
const BOT_WAYPOINTS: Point[] = [
  { x: 225, y: 175 }, { x: 170, y: 420 }, { x: 455, y: 435 }, { x: 650, y: 430 },
  { x: 820, y: 410 }, { x: 1010, y: 260 }, { x: 880, y: 690 }, { x: 630, y: 650 },
  { x: 1180, y: 910 }, { x: 1435, y: 740 }, { x: 1510, y: 510 }, { x: 1605, y: 1040 },
  { x: 1770, y: 1150 }, { x: 1690, y: 260 }, { x: 1280, y: 1040 },
];

type BotIntent = "wander" | "key" | "chest" | "task" | "follow" | "hunt" | "hide";
type BotBrain = {
  intent: BotIntent;
  targetId: string | null;
  decideAt: number;
  workingUntil: number;
  sabotageAt: number;
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type OutfitId = "deckhand" | "bandana" | "captain" | "admiral" | "shadow";

const OUTFITS: Array<{ id: OutfitId; icon: string; price: number; en: string; he: string }> = [
  { id: "deckhand", icon: "☠", price: 0, en: "Deckhand", he: "מלח הסיפון" },
  { id: "bandana", icon: "◆", price: 75, en: "Crimson Bandana", he: "בנדנה ארגמנית" },
  { id: "captain", icon: "⚓", price: 125, en: "Captain's Coat", he: "מעיל הקפטן" },
  { id: "admiral", icon: "♛", price: 200, en: "Golden Admiral", he: "אדמירל מוזהב" },
  { id: "shadow", icon: "☾", price: 300, en: "Cursed Shadow", he: "צל מקולל" },
];

function PirateAvatar({ player, moving = false, outfit = "deckhand" }: { player: PlayerState; moving?: boolean; outfit?: OutfitId }) {
  return (
    <div
      className={`pirate-avatar outfit-${outfit} ${player.isLocal ? "local" : ""} ${moving ? "walking" : ""} ${!player.alive ? "gone" : ""}`}
      style={{ left: player.x, top: player.y, "--pirate-color": player.color } as React.CSSProperties}
      aria-label={`${player.name}${player.isLocal ? ", you" : ""}`}
    >
      <span className="pirate-name">{player.name}</span>
      <div className="pirate-hat"><i /></div>
      <div className="pirate-face"><i className="eye left" /><i className="eye right" /><b /></div>
      <div className="pirate-body"><span>{OUTFITS.find((item) => item.id === outfit)?.icon || "☠"}</span></div>
      {player.carryingKeyId && <span className="carried-key">⚿</span>}
    </div>
  );
}

function OutfitShop({ language, coins, owned, equipped, onBuy, onEquip, onClose }: {
  language: Language;
  coins: number;
  owned: OutfitId[];
  equipped: OutfitId;
  onBuy: (outfit: OutfitId, price: number) => void;
  onEquip: (outfit: OutfitId) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-layer shop-layer" role="dialog" aria-modal="true" aria-label={ui(language, "Outfit shop", "חנות בגדים")}>
      <div className="shop-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <button className="round-close" onClick={onClose} aria-label={ui(language, "Close shop", "סגירת החנות")}>×</button>
        <span className="modal-kicker">{ui(language, "PIRATE OUTFITTER", "מלביש הפיראטים")}</span>
        <div className="shop-heading"><div><h2>{ui(language, "Dress for the raid", "התלבשו לפשיטה")}</h2><p>{ui(language, "Your outfit stays equipped between games.", "הבגד נשאר על הדמות גם במשחק הבא.")}</p></div><strong className="coin-balance">● {coins}</strong></div>
        <div className="outfit-grid">
          {OUTFITS.map((item) => {
            const isOwned = owned.includes(item.id);
            const isEquipped = equipped === item.id;
            return <article key={item.id} className={`outfit-card outfit-${item.id} ${isEquipped ? "equipped" : ""}`}>
              <div className="outfit-doll"><span>{item.icon}</span></div>
              <strong>{language === "he" ? item.he : item.en}</strong>
              <button disabled={isEquipped || (!isOwned && coins < item.price)} onClick={() => isOwned ? onEquip(item.id) : onBuy(item.id, item.price)}>
                {isEquipped ? ui(language, "EQUIPPED", "בשימוש") : isOwned ? ui(language, "WEAR", "לבישה") : item.price === 0 ? ui(language, "FREE", "חינם") : `● ${item.price}`}
              </button>
            </article>;
          })}
        </div>
      </div>
    </div>
  );
}

function TaskMiniGame({ task, cursed, language, onClose, onFinish }: { task: TaskState; cursed: boolean; language: Language; onClose: () => void; onFinish: () => void }) {
  const counts: Record<TaskKind, number> = { rope: 4, cannonballs: 6, map: 6, wheel: 5, coins: 7, lock: 4, lanterns: 5, anchor: 6, compass: 6, supplies: 6 };
  const [hit, setHit] = useState<number[]>([]);
  const targetCount = counts[task.kind];
  const labels: Record<TaskKind, string> = {
    rope: ui(language, "Tap each frayed knot", "לחצו על כל קשר פרום"), cannonballs: ui(language, "Load every cannonball", "טענו את כל כדורי התותח"), map: ui(language, "Rotate all map scraps", "סובבו את כל חלקי המפה"),
    wheel: ui(language, "Tighten every spoke", "חזקו את כל חישורי ההגה"), coins: ui(language, "Collect the loose coins", "אספו את המטבעות הפזורים"), lock: ui(language, "Press the tumblers in order", "לחצו על המנעולים לפי הסדר"),
    lanterns: ui(language, "Light every signal lantern", "הדליקו את כל פנסי האיתות"), anchor: ui(language, "Pull every link of chain", "משכו בכל חוליות השרשרת"), compass: ui(language, "Align every compass point", "יישרו את כל סימוני המצפן"), supplies: ui(language, "Sort every supply crate", "מיינו את כל ארגזי האספקה"),
  };
  const localizedTask = taskCopy(task.id, language);

  const tapTarget = (index: number) => {
    if (!hit.includes(index)) setHit((current) => [...current, index]);
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={task.title}>
      <div className="task-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <button className="round-close" onClick={onClose} aria-label={ui(language, "Close task", "סגירת משימה")}>×</button>
        <span className="modal-kicker">{cursed ? ui(language, "KEEP YOUR COVER", "שמרו על הכיסוי") : localizedTask.area.toUpperCase()}</span>
        <h2>{localizedTask.title}</h2>
        <p>{cursed ? ui(language, "Look busy. This work won’t help the crew.", "היראו עסוקים. העבודה הזאת לא תעזור לצוות.") : labels[task.kind]}</p>
        <div className={`mini-board mini-${task.kind}`}>
          {Array.from({ length: targetCount }, (_, index) => (
            <button
              key={index}
              className={hit.includes(index) ? "solved" : ""}
              onClick={() => tapTarget(index)}
              aria-label={`${labels[task.kind]} ${index + 1}`}
            >
              {task.kind === "rope" && "〰"}
              {task.kind === "cannonballs" && "●"}
              {task.kind === "map" && "⌁"}
              {task.kind === "wheel" && "✦"}
              {task.kind === "coins" && "●"}
              {task.kind === "lock" && index + 1}
              {task.kind === "lanterns" && "♨"}
              {task.kind === "anchor" && "⚓"}
              {task.kind === "compass" && "✥"}
              {task.kind === "supplies" && "▣"}
            </button>
          ))}
        </div>
        <div className="mini-progress"><span style={{ width: `${(hit.length / targetCount) * 100}%` }} /></div>
        <button className="modal-primary" disabled={hit.length < targetCount} onClick={onFinish}>
          {cursed ? ui(language, "FAKE COMPLETE", "זיוף הושלם") : ui(language, "TASK COMPLETE", "המשימה הושלמה")}
        </button>
      </div>
    </div>
  );
}

function MeetingModal({ players, reporter, language, onResolve }: { players: PlayerState[]; reporter: string; language: Language; onResolve: (ejectedId: string | null, votes: Record<string, number>) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, number> | null>(null);
  const [outcome, setOutcome] = useState<string>("");
  const [discussionLeft, setDiscussionLeft] = useState(20);
  const [chatText, setChatText] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; text: string; local?: boolean }>>([
    { id: "report", sender: reporter, text: ui(language, "I found the body. Where was everyone?", "מצאתי את הגופה. איפה כולם היו?") },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setDiscussionLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (![17, 13, 9, 5].includes(discussionLeft)) return;
    const bots = players.filter((player) => player.alive && !player.isLocal);
    const speaker = bots[Math.floor(Math.random() * bots.length)];
    const suspects = players.filter((player) => player.alive && player.id !== speaker?.id);
    const suspect = suspects[Math.floor(Math.random() * suspects.length)];
    const options = [
      ui(language, `I saw ${suspect?.name || "someone"} near the Treasure Room.`, `ראיתי את ${suspect?.isLocal ? "אתכם" : suspect?.name || "מישהו"} ליד חדר האוצר.`),
      ui(language, "I was fixing a task. Someone followed me.", "תיקנתי משימה. מישהו עקב אחריי."),
      ui(language, `Why was ${suspect?.isLocal ? "You" : suspect?.name} alone?`, `למה ${suspect?.isLocal ? "הייתם" : suspect?.name} לבד?`),
      ui(language, "Don’t rush the vote. The cursed want panic.", "אל תמהרו להצביע. המקוללים רוצים שניכנס לפאניקה."),
    ];
    if (speaker) {
      const timer = window.setTimeout(() => setMessages((current) => [...current, { id: `bot-${discussionLeft}`, sender: speaker.name, text: options[Math.floor(Math.random() * options.length)] }]), 0);
      return () => window.clearTimeout(timer);
    }
  }, [discussionLeft, language, players]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || discussionLeft === 0) return;
    setMessages((current) => [...current, { id: `you-${Date.now()}`, sender: ui(language, "You", "אתם"), text, local: true }]);
    setChatText("");
  };

  const vote = () => {
    if (!selected || results || discussionLeft > 0) return;
    const alive = players.filter((player) => player.alive);
    const tally: Record<string, number> = { [selected]: 1 };
    alive.filter((player) => !player.isLocal).forEach((voter) => {
      const choices = alive.filter((candidate) => candidate.id !== voter.id);
      if (Math.random() < 0.12) {
        tally.__skip__ = (tally.__skip__ || 0) + 1;
        return;
      }
      const ranked = [...choices].sort((a, b) => {
        const aScore = a.suspicion + Math.random() * 1.8;
        const bScore = b.suspicion + Math.random() * 1.8;
        return bScore - aScore;
      });
      const target = voter.role === "Cursed Pirate"
        ? ranked.find((candidate) => candidate.role === "Pirate") || ranked[0]
        : ranked[0];
      if (target) tally[target.id] = (tally[target.id] || 0) + 1;
    });
    setResults(tally);
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const ejected = tied || ranked[0]?.[0] === "__skip__" ? null : ranked[0]?.[0] || null;
    const ejectedPlayer = players.find((player) => player.id === ejected);
    setOutcome(tied
      ? ui(language, "Vote tied — no one is removed", "תיקו בהצבעה — אף אחד לא מודח")
      : ejectedPlayer
        ? ui(language, `${ejectedPlayer.name} walks the plank`, `${ejectedPlayer.isLocal ? "אתם" : ejectedPlayer.name} הולך מהסיפון`)
        : ui(language, "The crew chose to skip", "הצוות בחר לדלג"));
    window.setTimeout(() => onResolve(ejected, tally), 2800);
  };

  return (
    <div className="modal-layer meeting-layer" role="dialog" aria-modal="true" aria-label="Crew meeting">
      <div className="meeting-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <div className="meeting-bell">⚑</div>
        <span className="modal-kicker">{ui(language, `BODY REPORTED BY ${reporter.toUpperCase()}`, `גופה דווחה על ידי ${reporter === "You" ? "אתם" : reporter}`)}</span>
        <h2>{discussionLeft > 0 ? ui(language, "Discuss what happened", "דברו על מה שקרה") : ui(language, "Who carries the curse?", "מי נושא את הקללה?")}</h2>
        <p>{results ? ui(language, "The crew has spoken…", "הצוות אמר את דברו…") : discussionLeft > 0 ? ui(language, "Share clues before the vote opens.", "שתפו רמזים לפני שההצבעה נפתחת.") : ui(language, "Discussion over. Cast your vote.", "הדיון הסתיים. הצביעו עכשיו.")}</p>
        <div className={`discussion-timer ${discussionLeft === 0 ? "ready" : ""}`}><span>◷</span><strong>{discussionLeft > 0 ? ui(language, `${discussionLeft}s DISCUSSION`, `${discussionLeft} שנ׳ לדיון`) : ui(language, "VOTING OPEN", "ההצבעה פתוחה")}</strong></div>
        <div className="meeting-chat" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={message.local ? "local" : ""}><strong>{message.sender}</strong><p>{message.text}</p></div>)}
          <div ref={chatEndRef} className="chat-end" />
        </div>
        <form className="chat-compose" onSubmit={sendChat}>
          <input value={chatText} onChange={(event) => setChatText(event.target.value)} disabled={discussionLeft === 0} maxLength={120} placeholder={ui(language, "Type your defense…", "כתבו את טענתכם…")} aria-label={ui(language, "Meeting chat message", "הודעה בצ׳אט הישיבה")} />
          <button disabled={!chatText.trim() || discussionLeft === 0} type="submit">{ui(language, "SEND", "שליחה")}</button>
        </form>
        <div className={`vote-stage ${discussionLeft > 0 ? "locked" : ""}`}>
          <span className="vote-stage-title">{discussionLeft > 0 ? ui(language, "VOTE LOCKED DURING DISCUSSION", "ההצבעה נעולה בזמן הדיון") : ui(language, "CHOOSE A CREWMATE", "בחרו איש צוות")}</span>
        <div className="vote-list">
          {players.filter((player) => player.alive).map((player) => (
            <button key={player.id} disabled={discussionLeft > 0} className={`${selected === player.id ? "selected" : ""}`} onClick={() => !results && discussionLeft === 0 && setSelected(player.id)}>
              <span className="vote-avatar" style={{ background: player.color }}>☠</span>
              <strong>{player.isLocal ? ui(language, "You", "אתם") : player.name}</strong>
              <small>{results ? ui(language, `${results[player.id] || 0} VOTES`, `${results[player.id] || 0} קולות`) : player.isLocal ? ui(language, "YOU", "אתם") : ui(language, "VOTE", "הצבעה")}</small>
            </button>
          ))}
          <button disabled={discussionLeft > 0} className={`skip-vote ${selected === "__skip__" ? "selected" : ""}`} onClick={() => !results && discussionLeft === 0 && setSelected("__skip__")}>
            <span className="vote-avatar">≈</span>
            <strong>{ui(language, "Skip vote", "דילוג")}</strong>
            <small>{results ? ui(language, `${results.__skip__ || 0} VOTES`, `${results.__skip__ || 0} קולות`) : ui(language, "NO EJECTION", "ללא הדחה")}</small>
          </button>
        </div>
        {outcome && <div className="vote-outcome" role="status">{outcome}</div>}
        <button className="modal-primary danger" disabled={!selected || Boolean(results) || discussionLeft > 0} onClick={vote}>
          {results ? ui(language, "COUNTING VOTES…", "סופרים קולות…") : ui(language, "CAST VOTE", "שליחת הצבעה")}
        </button>
        </div>
      </div>
    </div>
  );
}

function OnlineMeetingModal({ meeting, players, localPlayerId, language, onChat, onVote }: { meeting: OnlineMeetingState; players: PlayerState[]; localPlayerId: string; language: Language; onChat: (text: string) => void; onVote: (targetId: string) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [chatText, setChatText] = useState("");
  const [selected, setSelected] = useState<string | null>(() => meeting.votes[localPlayerId] || null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const localPlayer = players.find((player) => player.id === localPlayerId);
  const discussionLeft = Math.max(0, Math.ceil((meeting.discussionEndsAt - now) / 1000));
  const voteLeft = Math.max(0, Math.ceil((meeting.voteEndsAt - now) / 1000));
  const voting = meeting.status === "voting";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [meeting.messages]);

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || meeting.status !== "discussion") return;
    onChat(text);
    setChatText("");
  };

  const outcomePlayer = players.find((player) => player.id === meeting.ejectedId);
  const outcome = meeting.status === "results"
    ? outcomePlayer
      ? ui(language, `${outcomePlayer.name} walks the plank`, `${outcomePlayer.id === localPlayerId ? "אתם" : outcomePlayer.name} הולך מהסיפון`)
      : ui(language, "No one was removed", "אף אחד לא הודח")
    : "";

  return (
    <div className="modal-layer meeting-layer" role="dialog" aria-modal="true" aria-label={ui(language, "Online crew meeting", "ישיבת צוות אונליין")}>
      <div className="meeting-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <div className="meeting-bell">⚑</div>
        <span className="modal-kicker">{ui(language, `LIVE REPORT · ${meeting.reporterName.toUpperCase()}`, `דיווח חי · ${meeting.reporterName}`)}</span>
        <h2>{meeting.status === "discussion" ? ui(language, "Discuss what happened", "דברו על מה שקרה") : meeting.status === "voting" ? ui(language, "Who carries the curse?", "מי נושא את הקללה?") : ui(language, "The crew has spoken", "הצוות אמר את דברו")}</h2>
        <div className={`discussion-timer ${meeting.status !== "discussion" ? "ready" : ""}`}><span>◷</span><strong>{meeting.status === "discussion" ? ui(language, `${discussionLeft}s DISCUSSION`, `${discussionLeft} שנ׳ לדיון`) : meeting.status === "voting" ? ui(language, `${voteLeft}s TO VOTE`, `${voteLeft} שנ׳ להצבעה`) : ui(language, "VOTES COUNTED", "הקולות נספרו")}</strong></div>
        <div className="meeting-chat" aria-live="polite">
          {meeting.messages.map((message) => <div key={message.id} className={message.senderId === localPlayerId ? "local" : ""}><strong>{message.senderId === localPlayerId ? ui(language, "You", "אתם") : message.sender}</strong><p>{message.text}</p></div>)}
          <div ref={chatEndRef} className="chat-end" />
        </div>
        <form className="chat-compose" onSubmit={submitChat}>
          <input value={chatText} onChange={(event) => setChatText(event.target.value)} disabled={meeting.status !== "discussion" || !localPlayer?.alive} maxLength={120} placeholder={ui(language, "Type your defense…", "כתבו את טענתכם…")} />
          <button disabled={!chatText.trim() || meeting.status !== "discussion" || !localPlayer?.alive} type="submit">{ui(language, "SEND", "שליחה")}</button>
        </form>
        <div className={`vote-stage ${!voting ? "locked" : ""}`}>
          <span className="vote-stage-title">{voting ? ui(language, "CHOOSE A CREWMATE", "בחרו איש צוות") : meeting.status === "discussion" ? ui(language, "VOTE OPENS AFTER DISCUSSION", "ההצבעה תיפתח לאחר הדיון") : ui(language, "FINAL TALLY", "ספירה סופית")}</span>
          <div className="vote-list">
            {players.filter((player) => player.alive).map((player) => <button key={player.id} disabled={!voting || Boolean(meeting.votes[localPlayerId]) || !localPlayer?.alive} className={selected === player.id ? "selected" : ""} onClick={() => setSelected(player.id)}>
              <span className="vote-avatar" style={{ background: player.color }}>☠</span><strong>{player.id === localPlayerId ? ui(language, "You", "אתם") : player.name}</strong><small>{meeting.status === "results" ? ui(language, `${meeting.results[player.id] || 0} VOTES`, `${meeting.results[player.id] || 0} קולות`) : ui(language, "VOTE", "הצבעה")}</small>
            </button>)}
            <button disabled={!voting || Boolean(meeting.votes[localPlayerId]) || !localPlayer?.alive} className={`skip-vote ${selected === "__skip__" ? "selected" : ""}`} onClick={() => setSelected("__skip__")}><span className="vote-avatar">≈</span><strong>{ui(language, "Skip vote", "דילוג")}</strong><small>{meeting.status === "results" ? ui(language, `${meeting.results.__skip__ || 0} VOTES`, `${meeting.results.__skip__ || 0} קולות`) : ui(language, "NO EJECTION", "ללא הדחה")}</small></button>
          </div>
          {outcome && <div className="vote-outcome" role="status">{outcome}</div>}
          <button className="modal-primary danger" disabled={!voting || !selected || Boolean(meeting.votes[localPlayerId]) || !localPlayer?.alive} onClick={() => selected && onVote(selected)}>{meeting.votes[localPlayerId] ? ui(language, "VOTE SENT", "ההצבעה נשלחה") : ui(language, "CAST VOTE", "שליחת הצבעה")}</button>
        </div>
      </div>
    </div>
  );
}

function TreasureModal({ treasures, language, onChoose }: { treasures: TreasureState[]; language: Language; onChoose: (treasure: TreasureState) => void }) {
  const localized = (treasure: TreasureState) => ({
    crown: { name: ui(language, "Drowned Crown", "כתר הטבועים"), description: ui(language, "A crown that hums with old sea songs.", "כתר המזמזם שירי ים עתיקים.") },
    pearl: { name: ui(language, "Moon Pearl", "פנינת הירח"), description: ui(language, "A pearl lit by a cold inner moon.", "פנינה המוארת באור ירח קר מבפנים.") },
    compass: { name: ui(language, "Star Compass", "מצפן הכוכבים"), description: ui(language, "Its needle points toward desire.", "המחט שלו מצביעה אל התשוקה.") },
  }[treasure.id] || { name: treasure.name, description: treasure.description });
  return (
    <div className="modal-layer treasure-layer" role="dialog" aria-modal="true" aria-label="Choose a treasure">
      <div className="treasure-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <span className="modal-kicker">{ui(language, "THE CHEST IS OPEN", "התיבה פתוחה")}</span>
        <h2>{ui(language, "Choose your fortune", "בחרו את גורלכם")}</h2>
        <p>{ui(language, "One prize may carry the island’s curse.", "אחד הפרסים עלול לשאת את קללת האי.")}</p>
        <div className="treasure-grid">
          {treasures.map((treasure) => (
            <button key={treasure.id} onClick={() => onChoose(treasure)}>
              <span>{treasure.icon}</span><strong>{localized(treasure).name}</strong><small>{localized(treasure).description}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HowToPlayModal({ language, onClose }: { language: Language; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const steps = [
    { icon: "✦", title: ui(language, "Explore & work", "חקרו ובצעו משימות"), detail: ui(language, "Move through the island and complete the gold task markers.", "נועו ברחבי האי והשלימו את סימוני המשימות הזהובים.") },
    { icon: "⚿", title: ui(language, "Recover five keys", "מצאו חמישה מפתחות"), detail: ui(language, "Carry one physical key at a time. Dropped keys remain in the world.", "אפשר לשאת מפתח פיזי אחד בכל פעם. מפתח שהופל נשאר בעולם.") },
    { icon: "◆", title: ui(language, "Feed the chest", "הכניסו מפתחות לתיבה"), detail: ui(language, "Bring every key to the central chest and insert all five seals.", "הביאו כל מפתח אל התיבה המרכזית והכניסו את כל חמשת החותמים.") },
    { icon: "⚑", title: ui(language, "Report & discuss", "דווחו ודברו"), detail: ui(language, "Report fallen crewmates, share clues, then vote—or skip.", "דווחו על אנשי צוות שנפלו, שתפו רמזים ואז הצביעו — או דלגו.") },
    { icon: "♛", title: ui(language, "Choose your fortune", "בחרו את גורלכם"), detail: ui(language, "Opening the chest starts a second phase. One treasure may spread the curse.", "פתיחת התיבה מתחילה שלב שני. אחד האוצרות עלול להפיץ את הקללה.") },
  ];

  return (
    <div className="modal-layer help-layer" role="dialog" aria-modal="true" aria-labelledby="how-to-title">
      <div className="how-to-modal" dir={language === "he" ? "rtl" : "ltr"}>
        <button className="round-close" onClick={onClose} aria-label={ui(language, "Close instructions", "סגירת ההוראות")}>×</button>
        <span className="modal-kicker">{ui(language, "CAPTAIN'S HANDBOOK", "המדריך של הקפטן")}</span>
        <h2 id="how-to-title">{ui(language, "How to play", "איך משחקים?")}</h2>
        <p>{ui(language, "Trust is scarce. Stay useful, watch the crew, and get the chest open.", "האמון נדיר. הישארו מועילים, השגיחו על הצוות ופתחו את התיבה.")}</p>
        <div className="help-role-grid">
          <article><span>⚓</span><div><strong>{ui(language, "Pirate", "פיראט")}</strong><small>{ui(language, "Finish tasks, secure keys, expose the cursed.", "השלימו משימות, אבטחו מפתחות וחשפו את המקוללים.")}</small></div></article>
          <article className="cursed"><span>☠</span><div><strong>{ui(language, "Cursed Pirate", "פיראט מקולל")}</strong><small>{ui(language, "Blend in, sabotage, hide keys, and strike unseen.", "היטמעו, חבלו, הסתירו מפתחות ופעלו בלי להיראות.")}</small></div></article>
        </div>
        <div className="help-steps">
          {steps.map((step, index) => <article key={step.title}><b>{index + 1}</b><span>{step.icon}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div></article>)}
        </div>
        <div className="control-guide">
          <strong>{ui(language, "CONTROLS", "שליטה")}</strong>
          <span><kbd>WASD</kbd> / <kbd>▲◀▼▶</kbd> {ui(language, "Move", "תנועה")}</span>
          <span><kbd>E</kbd> {ui(language, "Interact", "פעולה")}</span>
          <span><kbd>R</kbd> {ui(language, "Report", "דיווח")}</span>
        </div>
        <button className="modal-primary" onClick={onClose}>{ui(language, "READY TO RAID", "מוכנים לפשיטה")}</button>
      </div>
    </div>
  );
}

export default function CursedChestGame({ online, onExit, onOnlineChoice, initialLanguage = "en" }: { online?: OnlineGameSession; onExit?: () => void; onOnlineChoice?: (intent: "create" | "join") => void; initialLanguage?: Language }) {
  const initialOnline = online?.snapshot;
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [phase, setPhase] = useState<Phase>(() => initialOnline?.phase || "lobby");
  const [players, setPlayers] = useState<PlayerState[]>(() => initialOnline ? initialOnline.players.map((player) => ({ ...player, role: online?.roles[player.id] || "Pirate", isLocal: player.id === online?.uid })) : createPlayers());
  const [keys, setKeys] = useState<KeyState[]>(() => initialOnline?.keys || createKeys());
  const [tasks, setTasks] = useState<TaskState[]>(() => initialOnline?.tasks || createTasks());
  const [bodies, setBodies] = useState<BodyState[]>(() => initialOnline?.bodies || []);
  const [traps, setTraps] = useState<TrapState[]>(() => initialOnline?.traps || []);
  const [activeTask, setActiveTask] = useState<TaskState | null>(null);
  const [fakeTasks, setFakeTasks] = useState<string[]>([]);
  const [toast, setToast] = useState(() => ui(language, "Move with WASD, arrow keys, or the touch pad.", "זוזו עם WASD, מקשי החצים או לוח המגע."));
  const [reporter, setReporter] = useState("You");
  const [treasures, setTreasures] = useState<TreasureState[]>(() => initialOnline?.treasures || createTreasures());
  const [treasureTaken, setTreasureTaken] = useState<TreasureState | null>(null);
  const [endState, setEndState] = useState<{ title: string; detail: string; win: boolean } | null>(null);
  const [killCooldown, setKillCooldown] = useState(0);
  const [sabotageCooldown, setSabotageCooldown] = useState(0);
  const [chestPulse, setChestPulse] = useState(false);
  const [localMoving, setLocalMoving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [elapsed, setElapsed] = useState(initialOnline?.elapsed || 0);
  const [onlineMeeting, setOnlineMeeting] = useState<OnlineMeetingState | null>(() => initialOnline?.meeting || null);
  const [onlineReveal, setOnlineReveal] = useState(Boolean(online));
  const [onlineTreasureOpen, setOnlineTreasureOpen] = useState(false);
  const [onlineTreasureTakenBy, setOnlineTreasureTakenBy] = useState<string | null>(() => initialOnline?.treasureTakenBy || null);
  const [chestOpenedAt, setChestOpenedAt] = useState<number | null>(() => initialOnline?.chestOpenedAt || null);
  const [onlineCooldowns, setOnlineCooldowns] = useState<Record<string, { killReadyAt: number; sabotageReadyAt: number }>>(() => initialOnline?.cooldowns || {});
  const [onlineFakeTasksByPlayer, setOnlineFakeTasksByPlayer] = useState<Record<string, string[]>>(() => initialOnline?.fakeTasksByPlayer || {});
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [coins, setCoins] = useState(0);
  const [ownedOutfits, setOwnedOutfits] = useState<OutfitId[]>(["deckhand"]);
  const [equippedOutfit, setEquippedOutfit] = useState<OutfitId>("deckhand");
  const [shopOpen, setShopOpen] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [survivedMeetings, setSurvivedMeetings] = useState(0);
  const [localKills, setLocalKills] = useState(0);
  const [roundReward, setRoundReward] = useState<{ total: number; win: number; survival: number; kills: number } | null>(null);
  const pressed = useRef(new Set<string>());
  const playersRef = useRef(players);
  const keysRef = useRef(keys);
  const tasksRef = useRef(tasks);
  const bodiesRef = useRef(bodies);
  const trapsRef = useRef(traps);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastBotKill = useRef(0);
  const previousDelivered = useRef(0);
  const velocity = useRef({ x: 0, y: 0 });
  const joystickVector = useRef({ x: 0, y: 0 });
  const joystickPointer = useRef<number | null>(null);
  const previousPhase = useRef<Phase>(phase);
  const rewardClaimed = useRef(false);
  const botBrains = useRef<Record<string, BotBrain>>({});
  const interactRef = useRef<() => void>(() => undefined);
  const reportRef = useRef<() => void>(() => undefined);
  const elapsedRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  const onlineMeetingRef = useRef<OnlineMeetingState | null>(onlineMeeting);
  const endStateRef = useRef(endState);
  const treasureTakenRef = useRef(treasureTaken);
  const treasuresRef = useRef(treasures);
  const fakeTasksRef = useRef(fakeTasks);
  const onlineTreasureTakenByRef = useRef(onlineTreasureTakenBy);
  const chestOpenedAtRef = useRef(chestOpenedAt);
  const onlineCooldownsRef = useRef(onlineCooldowns);
  const onlineFakeTasksByPlayerRef = useRef(onlineFakeTasksByPlayer);
  const processedCommands = useRef(new Set<string>());
  const publishTimer = useRef<number | null>(null);
  const lastMotionSent = useRef(0);
  const onlineRef = useRef(online);
  const onlineMode = Boolean(online);
  const isOnlineHost = Boolean(online?.isHost);
  const deliveredCount = keys.filter((key) => key.delivered).length;
  const chestOpen = deliveredCount === 5;
  const localPlayerId = online?.uid || LOCAL_ID;
  const localPlayer = players.find((player) => player.id === localPlayerId)!;
  const localRole = localPlayer?.role || "Pirate";
  const hebrew = language === "he";
  const t = useCallback((english: string, hebrewText: string) => ui(language, english, hebrewText), [language]);

  useEffect(() => {
    try {
      const savedCoins = Number(window.localStorage.getItem("cursed-chest-coins") || 0);
      const savedOwned = JSON.parse(window.localStorage.getItem("cursed-chest-outfits") || "[\"deckhand\"]") as OutfitId[];
      const savedEquipped = (window.localStorage.getItem("cursed-chest-equipped") || "deckhand") as OutfitId;
      setCoins(Number.isFinite(savedCoins) ? Math.max(0, savedCoins) : 0);
      setOwnedOutfits(savedOwned.length ? Array.from(new Set(["deckhand" as OutfitId, ...savedOwned])) : ["deckhand"]);
      setEquippedOutfit(savedOwned.includes(savedEquipped) || savedEquipped === "deckhand" ? savedEquipped : "deckhand");
    } catch { /* Keep safe defaults when storage is unavailable. */ }
  }, []);

  const saveWallet = useCallback((nextCoins: number, nextOwned = ownedOutfits, nextEquipped = equippedOutfit) => {
    setCoins(nextCoins);
    setOwnedOutfits(nextOwned);
    setEquippedOutfit(nextEquipped);
    try {
      window.localStorage.setItem("cursed-chest-coins", String(nextCoins));
      window.localStorage.setItem("cursed-chest-outfits", JSON.stringify(nextOwned));
      window.localStorage.setItem("cursed-chest-equipped", nextEquipped);
    } catch { /* The current session still works without persistence. */ }
  }, [equippedOutfit, ownedOutfits]);

  const buyOutfit = (outfit: OutfitId, price: number) => {
    if (coins < price || ownedOutfits.includes(outfit)) return;
    const nextOwned = [...ownedOutfits, outfit];
    saveWallet(coins - price, nextOwned, outfit);
  };

  const equipOutfit = (outfit: OutfitId) => {
    if (!ownedOutfits.includes(outfit)) return;
    saveWallet(coins, ownedOutfits, outfit);
  };

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { keysRef.current = keys; }, [keys]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { bodiesRef.current = bodies; }, [bodies]);
  useEffect(() => { trapsRef.current = traps; }, [traps]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { onlineMeetingRef.current = onlineMeeting; }, [onlineMeeting]);
  useEffect(() => { endStateRef.current = endState; }, [endState]);
  useEffect(() => { treasureTakenRef.current = treasureTaken; }, [treasureTaken]);
  useEffect(() => { treasuresRef.current = treasures; }, [treasures]);
  useEffect(() => { fakeTasksRef.current = fakeTasks; }, [fakeTasks]);
  useEffect(() => { onlineTreasureTakenByRef.current = onlineTreasureTakenBy; }, [onlineTreasureTakenBy]);
  useEffect(() => { chestOpenedAtRef.current = chestOpenedAt; }, [chestOpenedAt]);
  useEffect(() => { onlineCooldownsRef.current = onlineCooldowns; }, [onlineCooldowns]);
  useEffect(() => { onlineFakeTasksByPlayerRef.current = onlineFakeTasksByPlayer; }, [onlineFakeTasksByPlayer]);
  useEffect(() => { onlineRef.current = online; }, [online]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 3200);
  }, []);

  const resetRound = useCallback(() => {
    if (online) {
      if (online.isHost) online.returnToLobby().catch(() => undefined);
      else onExit?.();
      return;
    }
    const nextPlayers = createPlayers(8);
    setPlayers(nextPlayers);
    setKeys(createKeys());
    setTasks(createTasks());
    setBodies([]);
    setTraps([]);
    setFakeTasks([]);
    setTreasures(createTreasures());
    setTreasureTaken(null);
    setEndState(null);
    setRoundReward(null);
    setSurvivedMeetings(0);
    setLocalKills(0);
    setElapsed(0);
    setKillCooldown(nextPlayers[0].role === "Cursed Pirate" ? 8 : 0);
    setSabotageCooldown(0);
    setToast(t("Move with WASD, arrow keys, or the touch pad.", "זוזו עם WASD, מקשי החצים או לוח המגע."));
    lastBotKill.current = Date.now();
    previousDelivered.current = 0;
    velocity.current = { x: 0, y: 0 };
    joystickVector.current = { x: 0, y: 0 };
    setJoystickKnob({ x: 0, y: 0 });
    rewardClaimed.current = false;
    botBrains.current = {};
    setPhase("reveal");
  }, [onExit, online, t]);

  useEffect(() => {
    if (previousPhase.current === "meeting" && phase === "playing" && localPlayer?.alive) {
      setSurvivedMeetings((count) => count + 1);
    }
    previousPhase.current = phase;
  }, [localPlayer?.alive, phase]);

  useEffect(() => {
    if (phase !== "ended" || !endState || rewardClaimed.current) return;
    rewardClaimed.current = true;
    const winReward = endState.win && localRole === "Pirate" ? 25 : 0;
    const survivalReward = survivedMeetings * 25;
    const killReward = localKills * 10;
    const total = winReward + survivalReward + killReward;
    setRoundReward({ total, win: winReward, survival: survivalReward, kills: killReward });
    if (total) saveWallet(coins + total);
  }, [coins, endState, localKills, localRole, phase, saveWallet, survivedMeetings]);

  useEffect(() => {
    if (!online || online.isHost) return;
    const snapshot = online.snapshot;
    const frame = window.requestAnimationFrame(() => {
      setPlayers((current) => snapshot.players.map((player) => {
      const previous = current.find((candidate) => candidate.id === player.id);
      const local = player.id === online.uid;
      return {
        ...player,
        ...(local && previous ? { x: previous.x, y: previous.y } : {}),
        role: local ? online.localRole : "Pirate",
        isLocal: local,
      };
      }));
      setKeys(snapshot.keys);
      setTasks(snapshot.tasks);
      setBodies(snapshot.bodies);
      setTraps(snapshot.traps);
      setTreasures(snapshot.treasures);
      setOnlineMeeting(snapshot.meeting);
      setOnlineCooldowns(snapshot.cooldowns || {});
      setOnlineFakeTasksByPlayer(snapshot.fakeTasksByPlayer || {});
      setFakeTasks(snapshot.fakeTasksByPlayer?.[online.uid] || []);
      setOnlineTreasureTakenBy(snapshot.treasureTakenBy);
      setChestOpenedAt(snapshot.chestOpenedAt);
      setTreasureTaken(snapshot.treasureTakenId ? snapshot.treasures.find((treasure) => treasure.id === snapshot.treasureTakenId) || null : null);
      setElapsed(snapshot.elapsed);
      setPhase(snapshot.phase);
      if (snapshot.endState) {
        const localFaction = online.localRole === "Cursed Pirate" ? "Cursed Pirates" : "Pirates";
        const won = snapshot.endState.winner === localFaction;
        setEndState({
          win: won,
          title: won ? ui(language, "Your side claims the island!", "הצד שלכם השתלט על האי!") : ui(language, "The other side prevailed", "הצד השני ניצח"),
          detail: snapshot.endState.winner === "Pirates" ? ui(language, "The crew secured the treasure and broke the curse.", "הצוות הבטיח את האוצר ושבר את הקללה.") : ui(language, "The curse outnumbered the remaining crew.", "הקללה גברה על אנשי הצוות שנותרו."),
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [language, online]);

  useEffect(() => {
    if (!online) return;
    const frame = window.requestAnimationFrame(() => setPlayers((current) => current.map((player) => ({
        ...player,
        role: player.id === online.uid || online.isHost ? online.roles[player.id] || player.role : "Pirate",
        isLocal: player.id === online.uid,
      }))));
    return () => window.cancelAnimationFrame(frame);
  }, [online]);

  useEffect(() => {
    if (!online || !online.isHost) return;
    const frame = window.requestAnimationFrame(() => setPlayers((current) => current.map((player) => {
        if (player.id === online.uid || player.isBot) return player;
        const motion = online.motions[player.id];
        return motion ? { ...player, x: motion.x, y: motion.y, target: { x: motion.x, y: motion.y } } : player;
      })));
    return () => window.cancelAnimationFrame(frame);
  }, [online]);

  useEffect(() => {
    if (!online || !localPlayer || phase !== "playing") return;
    const now = Date.now();
    if (now - lastMotionSent.current < 90) return;
    lastMotionSent.current = now;
    online.publishMotion({ x: localPlayer.x, y: localPlayer.y, moving: localMoving }).catch(() => undefined);
  }, [localMoving, localPlayer, online, phase]);

  const applyOnlineCommand = useCallback((command: OnlineCommand) => {
    const session = onlineRef.current;
    if (!session?.isHost) return;
    const now = Date.now();
    const nextPlayers = playersRef.current.map((player) => ({ ...player, target: { ...player.target } }));
    const nextKeys = keysRef.current.map((key) => ({ ...key }));
    const nextTasks = tasksRef.current.map((task) => ({ ...task }));
    const nextBodies = bodiesRef.current.map((body) => ({ ...body }));
    const nextTraps = trapsRef.current.map((trap) => ({ ...trap }));
    const actor = nextPlayers.find((player) => player.id === command.actorId);
    if (!actor || !actor.alive) return;
    const roleOf = (id: string) => session.roles[id] || nextPlayers.find((player) => player.id === id)?.role || "Pirate";
    const actorRole = roleOf(actor.id);
    let changed = false;

    if (command.type === "pickup-key") {
      const key = nextKeys.find((candidate) => candidate.id === command.payload.keyId);
      if (key && !actor.carryingKeyId && !key.delivered && !key.carrierId && distance(actor, key) < 74) {
        key.carrierId = actor.id;
        actor.carryingKeyId = key.id;
        changed = true;
      }
    }
    if (command.type === "drop-key") {
      const key = nextKeys.find((candidate) => candidate.id === actor.carryingKeyId);
      if (key) {
        key.carrierId = null; key.x = actor.x; key.y = actor.y; actor.carryingKeyId = null; changed = true;
      }
    }
    if (command.type === "deliver-key") {
      const key = nextKeys.find((candidate) => candidate.id === actor.carryingKeyId);
      if (key && distance(actor, CHEST) < 96) {
        key.delivered = true; key.carrierId = null; actor.carryingKeyId = null; changed = true;
        if (nextKeys.filter((candidate) => candidate.delivered).length === 5 && !chestOpenedAtRef.current) setChestOpenedAt(now);
      }
    }
    if (command.type === "finish-task") {
      const task = nextTasks.find((candidate) => candidate.id === command.payload.taskId);
      if (task && distance(actor, task) < 82) {
        if (actorRole === "Cursed Pirate") {
          const current = onlineFakeTasksByPlayerRef.current;
          if (!current[actor.id]?.includes(task.id)) setOnlineFakeTasksByPlayer({ ...current, [actor.id]: [...(current[actor.id] || []), task.id] });
        } else {
          task.completed = true; task.sabotaged = false; changed = true;
        }
      }
    }
    if (command.type === "eliminate") {
      const target = nextPlayers.find((candidate) => candidate.id === command.payload.targetId);
      const readyAt = onlineCooldownsRef.current[actor.id]?.killReadyAt || 0;
      if (actorRole === "Cursed Pirate" && target?.alive && roleOf(target.id) === "Pirate" && distance(actor, target) < 92 && readyAt <= now) {
        target.alive = false;
        if (target.carryingKeyId) {
          const dropped = nextKeys.find((key) => key.id === target.carryingKeyId);
          if (dropped) { dropped.carrierId = null; dropped.x = target.x; dropped.y = target.y; }
          target.carryingKeyId = null;
        }
        nextBodies.push({ id: `body-${now}-${target.id}`, playerId: target.id, playerName: target.name, color: target.color, x: target.x, y: target.y, reported: false });
        setOnlineCooldowns({ ...onlineCooldownsRef.current, [actor.id]: { killReadyAt: now + 14000, sabotageReadyAt: onlineCooldownsRef.current[actor.id]?.sabotageReadyAt || 0 } });
        changed = true;
      }
    }
    if (command.type === "sabotage") {
      const task = nextTasks.find((candidate) => candidate.id === command.payload.taskId);
      const readyAt = onlineCooldownsRef.current[actor.id]?.sabotageReadyAt || 0;
      if (actorRole === "Cursed Pirate" && task && !task.completed && distance(actor, task) < 118 && readyAt <= now) {
        task.sabotaged = true;
        setOnlineCooldowns({ ...onlineCooldownsRef.current, [actor.id]: { killReadyAt: onlineCooldownsRef.current[actor.id]?.killReadyAt || 0, sabotageReadyAt: now + 18000 } });
        changed = true;
      }
    }
    if (command.type === "place-trap") {
      const readyAt = onlineCooldownsRef.current[actor.id]?.sabotageReadyAt || 0;
      if (actorRole === "Cursed Pirate" && readyAt <= now) {
        nextTraps.push({ id: `trap-${now}-${actor.id}`, x: actor.x, y: actor.y, active: true });
        setOnlineCooldowns({ ...onlineCooldownsRef.current, [actor.id]: { killReadyAt: onlineCooldownsRef.current[actor.id]?.killReadyAt || 0, sabotageReadyAt: now + 14000 } });
        changed = true;
      }
    }
    if (command.type === "report") {
      const body = nextBodies.find((candidate) => candidate.id === command.payload.bodyId && !candidate.reported);
      if (body && distance(actor, body) < 88 && !onlineMeetingRef.current) {
        body.reported = true;
        const meeting: OnlineMeetingState = {
          id: `meeting-${now}`, bodyId: body.id, reporterId: actor.id, reporterName: actor.name,
          discussionEndsAt: now + 20000, voteEndsAt: now + 35000, status: "discussion",
          messages: [{ id: `report-${now}`, senderId: actor.id, sender: actor.name, text: ui(language, "I found the body. Where was everyone?", "מצאתי את הגופה. איפה כולם היו?"), createdAt: now }],
          votes: {}, results: {}, ejectedId: null, resolveAt: 0, lastBotMessageAt: now,
        };
        setReporter(actor.name); setOnlineMeeting(meeting); setPhase("meeting"); changed = true;
      }
    }
    if (command.type === "meeting-chat") {
      const meeting = onlineMeetingRef.current;
      const text = String(command.payload.text || "").trim().slice(0, 120);
      if (meeting?.status === "discussion" && text) setOnlineMeeting({ ...meeting, messages: [...meeting.messages.slice(-39), { id: command.id, senderId: actor.id, sender: actor.name, text, createdAt: now }] });
      return;
    }
    if (command.type === "meeting-vote") {
      const meeting = onlineMeetingRef.current;
      const targetId = String(command.payload.targetId || "");
      if (meeting?.status === "voting" && !meeting.votes[actor.id] && (targetId === "__skip__" || nextPlayers.some((player) => player.id === targetId && player.alive))) setOnlineMeeting({ ...meeting, votes: { ...meeting.votes, [actor.id]: targetId } });
      return;
    }
    if (command.type === "choose-treasure") {
      const treasure = treasuresRef.current.find((candidate) => candidate.id === command.payload.treasureId);
      if (treasure && !onlineTreasureTakenByRef.current && nextKeys.every((key) => key.delivered) && distance(actor, CHEST) < 102) {
        setTreasureTaken(treasure); setOnlineTreasureTakenBy(actor.id); setOnlineTreasureOpen(false);
        if (actorRole === "Pirate" && treasure.id === session.cursedTreasureId) {
          session.setSecretRole(actor.id, "Cursed Pirate").catch(() => undefined);
          actor.role = "Cursed Pirate";
          setOnlineCooldowns({ ...onlineCooldownsRef.current, [actor.id]: { killReadyAt: now + 6000, sabotageReadyAt: 0 } });
        }
        changed = true;
      }
    }
    if (command.type === "ring-bell" && treasureTakenRef.current && actorRole === "Pirate" && distance(actor, BELL) < 92) {
      setEndState({ win: actor.id === session.uid ? true : session.localRole === "Pirate", title: ui(language, "Treasure secured!", "האוצר הובטח!"), detail: ui(language, "The ship bell breaks the curse across the bay.", "פעמון הספינה שובר את הקללה ברחבי המפרץ.") });
      setPhase("ended");
      changed = true;
    }

    if (changed) {
      setPlayers(nextPlayers); setKeys(nextKeys); setTasks(nextTasks); setBodies(nextBodies); setTraps(nextTraps);
      const aliveCursed = nextPlayers.filter((player) => player.alive && roleOf(player.id) === "Cursed Pirate").length;
      const alivePirates = nextPlayers.filter((player) => player.alive && roleOf(player.id) === "Pirate").length;
      if (command.type === "eliminate" && aliveCursed > 0 && alivePirates <= aliveCursed) {
        setEndState({ win: session.localRole === "Cursed Pirate", title: ui(language, "The curse claims the crew", "הקללה השתלטה על הצוות"), detail: ui(language, "The remaining pirates are outnumbered.", "המקוללים גברו במספרם על הפיראטים שנותרו.") });
        setPhase("ended");
      }
    }
  }, [language]);

  useEffect(() => {
    if (!isOnlineHost || !online?.commands.length) return;
    online.commands.forEach((command) => {
      if (processedCommands.current.has(command.id)) return;
      processedCommands.current.add(command.id);
      applyOnlineCommand(command);
      online.removeCommand(command.id).catch(() => undefined);
    });
  }, [applyOnlineCommand, isOnlineHost, online]);

  useEffect(() => {
    if (!isOnlineHost) return;
    const timer = window.setInterval(() => {
      const session = onlineRef.current;
      if (!session) return;
      const now = Date.now();
      setOnlineMeeting((meeting) => {
        if (!meeting) return null;
        const alive = playersRef.current.filter((player) => player.alive);
        const bots = alive.filter((player) => player.isBot);
        if (meeting.status === "discussion") {
          if (now - meeting.lastBotMessageAt >= 4000 && bots.length) {
            const speaker = bots[Math.floor(Math.random() * bots.length)];
            const suspects = alive.filter((player) => player.id !== speaker.id);
            const suspect = suspects[Math.floor(Math.random() * suspects.length)];
            const options = [
              ui(language, `I saw ${suspect?.name || "someone"} near the paths.`, `ראיתי את ${suspect?.name || "מישהו"} ליד השבילים.`),
              ui(language, "I was working on a task. Someone followed me.", "עבדתי על משימה. מישהו עקב אחריי."),
              ui(language, "Don’t rush. The cursed want panic.", "אל תמהרו. המקוללים רוצים פאניקה."),
            ];
            return { ...meeting, lastBotMessageAt: now, messages: [...meeting.messages.slice(-39), { id: `bot-chat-${now}`, senderId: speaker.id, sender: speaker.name, text: options[Math.floor(Math.random() * options.length)], createdAt: now }] };
          }
          if (now >= meeting.discussionEndsAt) {
            const botVotes = { ...meeting.votes };
            bots.forEach((bot) => {
              const role = session.roles[bot.id] || bot.role;
              const candidates = alive.filter((player) => player.id !== bot.id).sort((a, b) => b.suspicion + Math.random() - (a.suspicion + Math.random()));
              if (Math.random() < .12) botVotes[bot.id] = "__skip__";
              else botVotes[bot.id] = role === "Cursed Pirate" ? candidates.find((player) => (session.roles[player.id] || player.role) === "Pirate")?.id || candidates[0]?.id : candidates[0]?.id;
            });
            return { ...meeting, status: "voting", votes: botVotes };
          }
          return meeting;
        }
        if (meeting.status === "voting") {
          const expectedHumans = alive.filter((player) => !player.isBot && session.roomPlayers.some((member) => member.uid === player.id && member.connected));
          const allHumansVoted = expectedHumans.every((player) => meeting.votes[player.id]);
          if (allHumansVoted || now >= meeting.voteEndsAt) {
            const results: Record<string, number> = {};
            Object.values(meeting.votes).forEach((targetId) => { if (targetId) results[targetId] = (results[targetId] || 0) + 1; });
            const ranked = Object.entries(results).sort((a, b) => b[1] - a[1]);
            const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
            const ejectedId = tied || !ranked[0] || ranked[0][0] === "__skip__" ? null : ranked[0][0];
            return { ...meeting, status: "results", results, ejectedId, resolveAt: now + 2800 };
          }
          return meeting;
        }
        if (meeting.status === "results" && now >= meeting.resolveAt) {
          const ejected = playersRef.current.find((player) => player.id === meeting.ejectedId);
          if (ejected) {
            const nextKeys = keysRef.current.map((key) => ejected.carryingKeyId === key.id ? { ...key, carrierId: null, x: ejected.x, y: ejected.y } : key);
            const nextPlayers = playersRef.current.map((player) => player.id === ejected.id ? { ...player, alive: false, carryingKeyId: null } : player);
            setKeys(nextKeys);
            setPlayers(nextPlayers);
            const aliveCursed = nextPlayers.filter((player) => player.alive && (session.roles[player.id] || player.role) === "Cursed Pirate").length;
            const alivePirates = nextPlayers.filter((player) => player.alive && (session.roles[player.id] || player.role) === "Pirate").length;
            if (aliveCursed === 0) {
              setEndState({ win: session.localRole === "Pirate", title: ui(language, "The curse is broken", "הקללה נשברה"), detail: ui(language, "The crew exposed every cursed pirate.", "הצוות חשף את כל הפיראטים המקוללים.") });
              setPhase("ended");
            } else if (alivePirates <= aliveCursed) {
              setEndState({ win: session.localRole === "Cursed Pirate", title: ui(language, "The curse claims the crew", "הקללה השתלטה על הצוות"), detail: ui(language, "The remaining pirates are outnumbered.", "המקוללים גברו במספרם על הפיראטים שנותרו.") });
              setPhase("ended");
            } else setPhase("playing");
          } else setPhase("playing");
          return null;
        }
        return meeting;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [isOnlineHost, language]);

  useEffect(() => {
    if (!isOnlineHost) return;
    const disconnected = online?.roomPlayers.filter((member) => !member.isBot && !member.connected) || [];
    if (!disconnected.length) return;
    const disconnectedIds = new Set(disconnected.map((member) => member.uid));
    const droppedKeys = keysRef.current.map((key) => {
      const carrier = playersRef.current.find((player) => player.id === key.carrierId && disconnectedIds.has(player.id));
      return carrier ? { ...key, carrierId: null, x: carrier.x, y: carrier.y } : key;
    });
    const nextPlayers = playersRef.current.map((player) => disconnectedIds.has(player.id) ? { ...player, alive: false, carryingKeyId: null } : player);
    setKeys(droppedKeys);
    setPlayers(nextPlayers);
    const session = onlineRef.current;
    const aliveCursed = nextPlayers.filter((player) => player.alive && (session?.roles[player.id] || player.role) === "Cursed Pirate").length;
    const alivePirates = nextPlayers.filter((player) => player.alive && (session?.roles[player.id] || player.role) === "Pirate").length;
    if (aliveCursed === 0) {
      setEndState({ win: session?.localRole === "Pirate", title: ui(language, "The curse is broken", "הקללה נשברה"), detail: ui(language, "No cursed pirates remain aboard.", "לא נותרו פיראטים מקוללים על הסיפון.") });
      setPhase("ended");
    } else if (alivePirates <= aliveCursed) {
      setEndState({ win: session?.localRole === "Cursed Pirate", title: ui(language, "The curse claims the crew", "הקללה השתלטה על הצוות"), detail: ui(language, "The remaining pirates are outnumbered.", "המקוללים גברו במספרם על הפיראטים שנותרו.") });
      setPhase("ended");
    }
  }, [isOnlineHost, language, online?.roomPlayers]);

  useEffect(() => {
    if (!isOnlineHost) return;
    publishTimer.current = window.setInterval(() => {
      const session = onlineRef.current;
      if (!session) return;
      const currentPhase = phaseRef.current === "ended" ? "ended" : onlineMeetingRef.current ? "meeting" : "playing";
      const localFaction = session.localRole === "Cursed Pirate" ? "Cursed Pirates" : "Pirates";
      const winner = endStateRef.current ? (endStateRef.current.win ? localFaction : localFaction === "Pirates" ? "Cursed Pirates" : "Pirates") : null;
      const snapshot: OnlineMatchSnapshot = {
        version: 1,
        phase: currentPhase,
        startedAt: session.snapshot.startedAt,
        elapsed: elapsedRef.current,
        players: playersRef.current,
        keys: keysRef.current,
        tasks: tasksRef.current,
        bodies: bodiesRef.current,
        traps: trapsRef.current,
        treasures: treasuresRef.current,
        treasureTakenBy: onlineTreasureTakenByRef.current,
        treasureTakenId: treasureTakenRef.current?.id || null,
        chestOpenedAt: chestOpenedAtRef.current,
        fakeTasksByPlayer: onlineFakeTasksByPlayerRef.current,
        cooldowns: onlineCooldownsRef.current,
        meeting: onlineMeetingRef.current,
        endState: winner ? { winner, reason: treasureTakenRef.current ? "bell" : "curse", endedAt: Date.now() } : null,
        updatedAt: Date.now(),
      };
      session.publishMatch(publicMatchSnapshot(snapshot)).catch(() => undefined);
    }, 250);
    return () => {
      if (publishTimer.current) window.clearInterval(publishTimer.current);
      publishTimer.current = null;
    };
  }, [isOnlineHost]);

  useEffect(() => {
    if (phase !== "playing" || (onlineMode && !isOnlineHost)) return;
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
      setKillCooldown((value) => Math.max(0, value - 1));
      setSabotageCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOnlineHost, onlineMode, phase]);

  useEffect(() => {
    if (!onlineMode || phase === "ended") return;
    const updateCooldownLabels = () => {
      const cooldown = onlineCooldownsRef.current[localPlayerId];
      setKillCooldown(Math.max(0, Math.ceil(((cooldown?.killReadyAt || 0) - Date.now()) / 1000)));
      setSabotageCooldown(Math.max(0, Math.ceil(((cooldown?.sabotageReadyAt || 0) - Date.now()) / 1000)));
    };
    updateCooldownLabels();
    const timer = window.setInterval(updateCooldownLabels, 500);
    return () => window.clearInterval(timer);
  }, [localPlayerId, onlineMode, phase]);

  useEffect(() => {
    if (phase !== "playing" || !localPlayer?.alive) return;
    const pressedKeys = pressed.current;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        if (!pressedKeys.has(key)) {
          if (key === "arrowleft" || key === "a") velocity.current.x -= 0.065;
          if (key === "arrowright" || key === "d") velocity.current.x += 0.065;
          if (key === "arrowup" || key === "w") velocity.current.y -= 0.065;
          if (key === "arrowdown" || key === "s") velocity.current.y += 0.065;
        }
        pressedKeys.add(key);
      }
      if (key === "e") interactRef.current();
      if (key === "r") reportRef.current();
    };
    const up = (event: KeyboardEvent) => pressedKeys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    let frame = 0;
    let previous = performance.now();
    const move = (now: number) => {
      const frameMs = Math.min(32, now - previous);
      const dt = frameMs / 16.67;
      previous = now;
      const set = pressedKeys;
      let dx = Number(set.has("d") || set.has("arrowright")) - Number(set.has("a") || set.has("arrowleft")) + joystickVector.current.x;
      let dy = Number(set.has("s") || set.has("arrowdown")) - Number(set.has("w") || set.has("arrowup")) + joystickVector.current.y;
      const acceleration = 0.0019 * frameMs;
      const maxSpeed = 0.27;
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        dx /= length; dy /= length;
        velocity.current.x += dx * acceleration;
        velocity.current.y += dy * acceleration;
      } else {
        velocity.current.x *= Math.pow(0.78, dt);
        velocity.current.y *= Math.pow(0.78, dt);
      }
      const speed = Math.hypot(velocity.current.x, velocity.current.y);
      if (speed > maxSpeed) {
        velocity.current.x = (velocity.current.x / speed) * maxSpeed;
        velocity.current.y = (velocity.current.y / speed) * maxSpeed;
      }
      if (speed > 0.006 || dx || dy) setPlayers((current) => current.map((player) => player.id === localPlayerId ? {
        ...player,
        x: clamp(player.x + velocity.current.x * frameMs, 42, WORLD.width - 42),
        y: clamp(player.y + velocity.current.y * frameMs, 42, WORLD.height - 42),
      } : player));
      setLocalMoving(speed > 0.006 || Boolean(dx || dy));
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      pressedKeys.clear();
      velocity.current = { x: 0, y: 0 };
      setLocalMoving(false);
    };
  }, [phase, localPlayer?.alive, localPlayerId]);

  useEffect(() => {
    if (phase !== "playing" || (onlineMode && !isOnlineHost)) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const nextPlayers = playersRef.current.map((player) => ({ ...player }));
      const nextKeys = keysRef.current.map((key) => ({ ...key }));
      const nextTasks = tasksRef.current.map((task) => ({ ...task }));
      const newBodies: BodyState[] = [];
      const triggeredTraps: string[] = [];
      let autoReporter: PlayerState | null = null;
      let localKilled = false;

      nextPlayers.forEach((bot) => {
        if (bot.id === localPlayerId || !bot.alive || (onlineMode && !bot.isBot)) return;
        const brain = botBrains.current[bot.id] ||= {
          intent: "wander",
          targetId: null,
          decideAt: now + Math.random() * 1400,
          workingUntil: 0,
          sabotageAt: now + 12000 + Math.random() * 9000,
        };
        const carried = nextKeys.find((key) => key.carrierId === bot.id);

        const unreportedBody = bodiesRef.current.find((body) => !body.reported && distance(bot, body) < 64);
        if (unreportedBody && bot.role === "Pirate" && Math.random() < 0.18) autoReporter = bot;
        const snare = trapsRef.current.find((trap) => trap.active && !triggeredTraps.includes(trap.id) && distance(bot, trap) < 38);
        if (snare && bot.role === "Pirate") {
          triggeredTraps.push(snare.id);
          brain.intent = "wander";
          brain.targetId = null;
          brain.decideAt = now + 2400;
          bot.target = { x: bot.x, y: bot.y };
        }

        if (carried && bot.role === "Pirate") {
          brain.intent = "chest";
          bot.target = CHEST;
        } else if (carried && bot.role === "Cursed Pirate") {
          brain.intent = "hide";
          if (brain.targetId === carried.id && distance(bot, bot.target) < 55) {
            carried.carrierId = null;
            carried.x = bot.x;
            carried.y = bot.y;
            bot.carryingKeyId = null;
            bot.suspicion += 0.35;
            brain.targetId = null;
            brain.decideAt = now + 1800;
          }
        } else if (brain.intent === "task" && brain.targetId) {
          const task = nextTasks.find((candidate) => candidate.id === brain.targetId && (!candidate.completed || candidate.sabotaged));
          if (!task) {
            brain.targetId = null;
            brain.intent = "wander";
            brain.decideAt = now;
          } else {
            bot.target = task;
            if (distance(bot, task) < 46) {
              if (!brain.workingUntil) brain.workingUntil = now + 1500 + Math.random() * 1600;
              if (now >= brain.workingUntil) {
                if (bot.role === "Pirate") {
                  task.completed = true;
                  task.sabotaged = false;
                  bot.suspicion = Math.max(0, bot.suspicion - 0.2);
                }
                brain.workingUntil = 0;
                brain.targetId = null;
                brain.intent = "wander";
                brain.decideAt = now + 900 + Math.random() * 1400;
              }
            }
          }
        }

        if (!carried && now >= brain.decideAt && brain.intent !== "task") {
          const freeKeys = nextKeys.filter((key) => !key.delivered && !key.carrierId).sort((a, b) => distance(bot, a) - distance(bot, b));
          const openTasks = nextTasks.filter((task) => !task.completed || task.sabotaged).sort((a, b) => distance(bot, a) - distance(bot, b));
          const roll = Math.random();
          if (bot.role === "Pirate" && freeKeys.length && roll < 0.52) {
            brain.intent = "key"; brain.targetId = freeKeys[0].id; bot.target = freeKeys[0];
          } else if (openTasks.length && roll < (bot.role === "Pirate" ? 0.84 : 0.58)) {
            const task = openTasks[Math.floor(Math.random() * Math.min(3, openTasks.length))];
            brain.intent = "task"; brain.targetId = task.id; brain.workingUntil = 0; bot.target = task;
          } else if (roll < 0.72) {
            const company = nextPlayers.filter((candidate) => candidate.alive && candidate.id !== bot.id);
            const companion = company[Math.floor(Math.random() * company.length)];
            brain.intent = "follow"; brain.targetId = companion?.id || null;
            if (companion) bot.target = { x: companion.x + (Math.random() - .5) * 90, y: companion.y + (Math.random() - .5) * 90 };
          } else {
            brain.intent = "wander"; brain.targetId = null;
            bot.target = BOT_WAYPOINTS[Math.floor(Math.random() * BOT_WAYPOINTS.length)];
          }
          brain.decideAt = now + 3200 + Math.random() * 4200;
        }

        if (brain.intent === "key" && brain.targetId) {
          const key = nextKeys.find((candidate) => candidate.id === brain.targetId && !candidate.delivered && !candidate.carrierId);
          if (key) bot.target = key;
          else { brain.targetId = null; brain.intent = "wander"; brain.decideAt = now; }
        }
        if (brain.intent === "follow" && brain.targetId && now % 1000 < 260) {
          const companion = nextPlayers.find((candidate) => candidate.id === brain.targetId && candidate.alive);
          if (companion) bot.target = { x: companion.x + (Math.random() - .5) * 105, y: companion.y + (Math.random() - .5) * 105 };
        }

        if (bot.role === "Cursed Pirate" && !carried && now - lastBotKill.current > 19000) {
          const victims = nextPlayers
            .filter((candidate) => candidate.alive && candidate.role === "Pirate" && candidate.id !== bot.id && (!candidate.isLocal || elapsedRef.current > 38))
            .map((candidate) => ({ candidate, isolation: Math.min(...nextPlayers.filter((other) => other.alive && other.id !== candidate.id && other.id !== bot.id).map((other) => distance(candidate, other)), 999) }))
            .filter(({ isolation }) => isolation > 115)
            .sort((a, b) => distance(bot, a.candidate) - distance(bot, b.candidate));
          const victim = victims[0]?.candidate;
          if (victim && (brain.intent === "hunt" || Math.random() < 0.16)) {
            brain.intent = "hunt";
            brain.targetId = victim.id;
            bot.target = victim;
            if (distance(bot, victim) < 58) {
              victim.alive = false;
              if (victim.carryingKeyId) {
                const dropped = nextKeys.find((key) => key.id === victim.carryingKeyId);
                if (dropped) { dropped.carrierId = null; dropped.x = victim.x; dropped.y = victim.y; }
                victim.carryingKeyId = null;
              }
              newBodies.push({ id: `body-${now}-${victim.id}`, playerId: victim.id, playerName: victim.name, color: victim.color, x: victim.x, y: victim.y, reported: false });
              localKilled = Boolean(victim.isLocal);
              lastBotKill.current = now;
              brain.intent = "wander";
              brain.targetId = null;
              brain.decideAt = now + 2600;
            }
          }
        }

        if (bot.role === "Cursed Pirate" && now >= brain.sabotageAt) {
          const nearby = nextTasks.find((task) => !task.completed && !task.sabotaged && distance(bot, task) < 70);
          if (nearby && Math.random() < 0.32) {
            nearby.sabotaged = true;
            bot.suspicion += 0.22;
            brain.sabotageAt = now + 17000 + Math.random() * 10000;
          }
        }

        if (snare && bot.role === "Pirate") bot.target = { x: bot.x, y: bot.y };

        const dx = bot.target.x - bot.x;
        const dy = bot.target.y - bot.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const botSpeed = brain.intent === "hunt" ? 24 : brain.intent === "follow" ? 18 : 20;
        bot.x = clamp(bot.x + (dx / length) * Math.min(botSpeed, length), 42, WORLD.width - 42);
        bot.y = clamp(bot.y + (dy / length) * Math.min(botSpeed, length), 42, WORLD.height - 42);

        if (!bot.carryingKeyId) {
          const pickup = nextKeys.find((key) => !key.delivered && !key.carrierId && distance(bot, key) < 44);
          const shouldTake = pickup && (bot.role === "Pirate" || Math.random() < .22);
          if (pickup && shouldTake) {
            pickup.carrierId = bot.id;
            bot.carryingKeyId = pickup.id;
            brain.targetId = pickup.id;
            if (bot.role === "Cursed Pirate") {
              brain.intent = "hide";
              const hideSpot = BOT_WAYPOINTS.reduce((furthest, point) => distance(CHEST, point) > distance(CHEST, furthest) ? point : furthest);
              bot.target = { x: hideSpot.x + (Math.random() - .5) * 100, y: hideSpot.y + (Math.random() - .5) * 100 };
            }
          }
        }
        if (bot.carryingKeyId && bot.role === "Pirate" && distance(bot, CHEST) < 72) {
          const delivered = nextKeys.find((key) => key.id === bot.carryingKeyId);
          if (delivered) { delivered.delivered = true; delivered.carrierId = null; }
          bot.carryingKeyId = null;
          brain.intent = "wander";
          brain.targetId = null;
          brain.decideAt = now + 1200;
        }
      });

      if (newBodies.length) setBodies((current) => [...current, ...newBodies]);
      setPlayers(nextPlayers);
      setKeys(nextKeys);
      setTasks(nextTasks);
      if (triggeredTraps.length) setTraps((current) => current.map((trap) => triggeredTraps.includes(trap.id) ? { ...trap, active: false } : trap));
      if (onlineMode && newBodies.length) {
        const session = onlineRef.current;
        const aliveCursed = nextPlayers.filter((player) => player.alive && (session?.roles[player.id] || player.role) === "Cursed Pirate").length;
        const alivePirates = nextPlayers.filter((player) => player.alive && (session?.roles[player.id] || player.role) === "Pirate").length;
        if (aliveCursed > 0 && alivePirates <= aliveCursed) {
          setEndState({ win: session?.localRole === "Cursed Pirate", title: ui(language, "The curse claims the crew", "הקללה השתלטה על הצוות"), detail: ui(language, "The remaining pirates are outnumbered.", "המקוללים גברו במספרם על הפיראטים שנותרו.") });
          setPhase("ended");
        }
      }
      if (localKilled && !onlineMode) {
        setEndState({ win: false, title: ui(language, "Lost to the shadows", "נפלתם בצללים"), detail: ui(language, "A hidden attacker caught you alone. The crew never saw who struck.", "תוקף נסתר תפס אתכם לבד. הצוות לא ראה מי תקף.") });
        setPhase("ended");
      } else if (autoReporter) {
        const found = bodiesRef.current.find((body) => !body.reported && distance(autoReporter!, body) < 70);
        if (found) {
          setBodies((current) => current.map((body) => body.id === found.id ? { ...body, reported: true } : body));
          setPlayers((current) => current.map((player) => player.alive && player.id !== autoReporter!.id && distance(player, found) < 145 ? { ...player, suspicion: player.suspicion + 0.65 } : player));
          setReporter(autoReporter.name);
          if (onlineMode) {
            const meetingNow = Date.now();
            setOnlineMeeting({
              id: `meeting-${meetingNow}`, bodyId: found.id, reporterId: autoReporter.id, reporterName: autoReporter.name,
              discussionEndsAt: meetingNow + 20000, voteEndsAt: meetingNow + 35000, status: "discussion",
              messages: [{ id: `report-${meetingNow}`, senderId: autoReporter.id, sender: autoReporter.name, text: ui(language, "I found the body. Where was everyone?", "מצאתי את הגופה. איפה כולם היו?"), createdAt: meetingNow }],
              votes: {}, results: {}, ejectedId: null, resolveAt: 0, lastBotMessageAt: meetingNow,
            });
          }
          setPhase("meeting");
        }
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [isOnlineHost, phase, language, localPlayerId, onlineMode]);

  useEffect(() => {
    if (!localPlayer || !viewportRef.current) return;
    const width = viewportRef.current.clientWidth;
    const height = viewportRef.current.clientHeight;
    setCamera({ x: Math.round(clamp(localPlayer.x - width / 2, 0, WORLD.width - width) * 2) / 2, y: Math.round(clamp(localPlayer.y - height / 2, 0, WORLD.height - height) * 2) / 2 });
  }, [localPlayer]);

  useEffect(() => {
    if (deliveredCount > previousDelivered.current) {
      const pulseFrame = window.requestAnimationFrame(() => setChestPulse(true));
      const timer = window.setTimeout(() => {
        setChestPulse(false);
        if (deliveredCount === 5) {
          if (isOnlineHost && !chestOpenedAtRef.current) setChestOpenedAt(Date.now());
          showToast(t("The five seals release. The chest is open—but the round is not over.", "חמשת החותמים השתחררו. התיבה פתוחה — אבל הסיבוב עדיין לא נגמר."));
        }
      }, 750);
      previousDelivered.current = deliveredCount;
      return () => { window.cancelAnimationFrame(pulseFrame); window.clearTimeout(timer); };
    }
    previousDelivered.current = deliveredCount;
  }, [deliveredCount, isOnlineHost, showToast, t]);

  const nearestKey = useMemo(() => keys.filter((key) => !key.delivered && !key.carrierId).sort((a, b) => distance(localPlayer, a) - distance(localPlayer, b))[0], [keys, localPlayer]);
  const nearestTask = useMemo(() => tasks.filter((task) => !task.completed && !fakeTasks.includes(task.id)).sort((a, b) => distance(localPlayer, a) - distance(localPlayer, b))[0], [tasks, fakeTasks, localPlayer]);
  const nearestBody = useMemo(() => bodies.filter((body) => !body.reported).sort((a, b) => distance(localPlayer, a) - distance(localPlayer, b))[0], [bodies, localPlayer]);
  const nearestBot = useMemo(() => players.filter((player) => player.id !== localPlayerId && player.alive).sort((a, b) => distance(localPlayer, a) - distance(localPlayer, b))[0], [players, localPlayer, localPlayerId]);
  const carriedKey = keys.find((key) => key.carrierId === localPlayerId);
  const chestNear = distance(localPlayer, CHEST) < 90;
  const bellNear = distance(localPlayer, BELL) < 85;
  const canReport = Boolean(nearestBody && distance(localPlayer, nearestBody) < 82);

  const interaction = useMemo(() => {
    if (!localPlayer?.alive) return { label: t("SPECTATING", "צפייה"), disabled: true };
    if (treasureTaken && bellNear && localRole === "Pirate") return { label: t("RING SHIP BELL", "צלצלו בפעמון"), disabled: false };
    if (chestOpen && !treasureTaken && chestNear) return { label: t("CHOOSE TREASURE", "בחרו אוצר"), disabled: false };
    if (carriedKey && chestNear && !chestOpen) return { label: t("INSERT KEY", "הכניסו מפתח"), disabled: false };
    if (!carriedKey && nearestKey && distance(localPlayer, nearestKey) < 68) return { label: t(`TAKE ${keyName(nearestKey.id, language).toUpperCase()}`, `קחו את ${keyName(nearestKey.id, language)}`), disabled: false };
    if (nearestTask && distance(localPlayer, nearestTask) < 74) return { label: nearestTask.sabotaged ? t("REPAIR SABOTAGE", "תקנו את החבלה") : taskCopy(nearestTask.id, language).short.toUpperCase(), disabled: false };
    return { label: t("EXPLORE", "חקרו"), disabled: true };
  }, [language, localPlayer, treasureTaken, bellNear, localRole, chestOpen, chestNear, carriedKey, nearestKey, nearestTask, t]);

  const interactionTarget = useMemo<Point | null>(() => {
    if (interaction.disabled) return null;
    if (treasureTaken && bellNear && localRole === "Pirate") return BELL;
    if (chestNear && (chestOpen || carriedKey)) return CHEST;
    if (!carriedKey && nearestKey && distance(localPlayer, nearestKey) < 68) return nearestKey;
    if (nearestTask && distance(localPlayer, nearestTask) < 74) return nearestTask;
    return null;
  }, [interaction.disabled, treasureTaken, bellNear, localRole, chestNear, chestOpen, carriedKey, nearestKey, nearestTask, localPlayer]);

  const interact = useCallback(() => {
    if (phase !== "playing" || !localPlayer.alive) return;
    if (treasureTaken && bellNear && localRole === "Pirate") {
      if (online) { online.sendCommand("ring-bell").catch(() => undefined); return; }
      setEndState({ win: true, title: t("Treasure secured!", "האוצר הובטח!"), detail: t("The bell sounds across the bay. Your crew survived the curse.", "הפעמון נשמע ברחבי המפרץ. הצוות שלכם שרד את הקללה.") });
      setPhase("ended"); return;
    }
    if (chestOpen && !treasureTaken && chestNear) {
      if (online) setOnlineTreasureOpen(true);
      else setPhase("treasure");
      return;
    }
    if (carriedKey && chestNear && !chestOpen) {
      if (online) { online.sendCommand("deliver-key", { keyId: carriedKey.id }).catch(() => undefined); return; }
      setKeys((current) => current.map((key) => key.id === carriedKey.id ? { ...key, delivered: true, carrierId: null } : key));
      setPlayers((current) => current.map((player) => player.id === localPlayerId ? { ...player, carryingKeyId: null } : player));
      showToast(t(`${carriedKey.name} locked into the chest.`, `${keyName(carriedKey.id, language)} ננעל בתוך התיבה.`)); return;
    }
    if (!carriedKey && nearestKey && distance(localPlayer, nearestKey) < 68) {
      if (online) { online.sendCommand("pickup-key", { keyId: nearestKey.id }).catch(() => undefined); return; }
      setKeys((current) => current.map((key) => key.id === nearestKey.id ? { ...key, carrierId: localPlayerId } : key));
      setPlayers((current) => current.map((player) => player.id === localPlayerId ? { ...player, carryingKeyId: nearestKey.id } : player));
      showToast(t(`You are carrying the ${nearestKey.name}.`, `אתם נושאים את ${keyName(nearestKey.id, language)}.`)); return;
    }
    if (nearestTask && distance(localPlayer, nearestTask) < 74) setActiveTask(nearestTask);
  }, [phase, localPlayer, localPlayerId, treasureTaken, bellNear, localRole, chestOpen, chestNear, carriedKey, nearestKey, nearestTask, online, showToast, language, t]);

  const dropKey = () => {
    if (!carriedKey) return;
    if (online) { online.sendCommand("drop-key", { keyId: carriedKey.id }).catch(() => undefined); return; }
    setKeys((current) => current.map((key) => key.id === carriedKey.id ? { ...key, carrierId: null, x: localPlayer.x, y: localPlayer.y } : key));
    setPlayers((current) => current.map((player) => player.id === localPlayerId ? { ...player, carryingKeyId: null } : player));
    showToast(t(`${carriedKey.name} dropped on the ground.`, `${keyName(carriedKey.id, language)} הונח על הקרקע.`));
  };

  const finishTask = () => {
    if (!activeTask) return;
    if (online) {
      online.sendCommand("finish-task", { taskId: activeTask.id }).catch(() => undefined);
      setActiveTask(null);
      return;
    }
    if (localRole === "Cursed Pirate") {
      setFakeTasks((current) => [...current, activeTask.id]);
      showToast(t("You fooled the crew. No real progress was made.", "הצלחתם להטעות את הצוות. לא הושגה התקדמות אמיתית."));
    } else {
      setTasks((current) => current.map((task) => task.id === activeTask.id ? { ...task, completed: true, sabotaged: false } : task));
      showToast(t(`${activeTask.short} complete.`, `${taskCopy(activeTask.id, language).short} הושלם.`));
    }
    setActiveTask(null);
  };

  const reportBody = useCallback(() => {
    if (!nearestBody || !canReport) return;
    if (online) { online.sendCommand("report", { bodyId: nearestBody.id }).catch(() => undefined); return; }
    setBodies((current) => current.map((body) => body.id === nearestBody.id ? { ...body, reported: true } : body));
    setReporter("You");
    setPhase("meeting");
  }, [nearestBody, canReport, online]);

  const resolveMeeting = (ejectedId: string | null) => {
    if (!ejectedId) { showToast(t("No one was removed. Stay alert.", "אף אחד לא הודח. הישארו ערניים.")); setPhase("playing"); return; }
    const ejected = players.find((player) => player.id === ejectedId);
    if (ejected?.carryingKeyId) {
      setKeys((current) => current.map((key) => key.id === ejected.carryingKeyId ? { ...key, carrierId: null, x: ejected.x, y: ejected.y } : key));
    }
    setPlayers((current) => current.map((player) => player.id === ejectedId ? { ...player, alive: false } : player));
    if (ejected?.isLocal) {
      setEndState({ win: false, title: t("Cast overboard", "הושלכתם מהסיפון"), detail: t("The crew voted you out. The island keeps its secrets.", "הצוות הצביע נגדכם. האי שומר את סודותיו.") });
      setPhase("ended"); return;
    }
    if (ejected?.role === "Cursed Pirate") showToast(t(`${ejected.name} was cursed. The crew breathes easier—for now.`, `${ejected.name} היה מקולל. הצוות נושם לרווחה — בינתיים.`));
    else showToast(t(`${ejected?.name} was an innocent Pirate.`, `${ejected?.name} היה פיראט חף מפשע.`));
    setPhase("playing");
  };

  const eliminate = () => {
    if (localRole !== "Cursed Pirate" || killCooldown || !nearestBot || distance(localPlayer, nearestBot) > 88) return;
    if (online) { online.sendCommand("eliminate", { targetId: nearestBot.id }).catch(() => undefined); setLocalKills((count) => count + 1); setKillCooldown(14); return; }
    setPlayers((current) => current.map((player) => player.id === nearestBot.id ? { ...player, alive: false, carryingKeyId: null } : player));
    if (nearestBot.carryingKeyId) setKeys((current) => current.map((key) => key.id === nearestBot.carryingKeyId ? { ...key, carrierId: null, x: nearestBot.x, y: nearestBot.y } : key));
    setBodies((current) => [...current, { id: `body-local-${Date.now()}`, playerId: nearestBot.id, playerName: nearestBot.name, color: nearestBot.color, x: nearestBot.x, y: nearestBot.y, reported: false }]);
    const witnesses = players.filter((player) => !player.isLocal && player.alive && player.id !== nearestBot.id && distance(player, localPlayer) < 145);
    if (witnesses.length) setPlayers((current) => current.map((player) => player.id === localPlayerId ? { ...player, suspicion: player.suspicion + witnesses.length * 0.8 } : player));
    setKillCooldown(14);
    setLocalKills((count) => count + 1);
    showToast(t(`${nearestBot.name} was silenced. Leave before you’re seen.`, `${nearestBot.name} הושתק. הסתלקו לפני שיראו אתכם.`));
    const remainingPirates = players.filter((player) => !player.isLocal && player.alive && player.role === "Pirate" && player.id !== nearestBot.id);
    if (remainingPirates.length <= 2) {
      setEndState({ win: true, title: t("The curse claims the crew", "הקללה השתלטה על הצוות"), detail: t("You turned the opened treasure against every pirate aboard.", "הפניתם את האוצר הפתוח נגד כל פיראט על הסיפון.") });
      setPhase("ended");
    }
  };

  const sabotage = () => {
    if (localRole !== "Cursed Pirate" || sabotageCooldown) return;
    const target = tasks.filter((task) => !task.completed).sort((a, b) => distance(localPlayer, a) - distance(localPlayer, b))[0];
    if (!target || distance(localPlayer, target) > 110) { showToast(t("Move closer to a task to sabotage it.", "התקרבו למשימה כדי לחבל בה.")); return; }
    if (online) { online.sendCommand("sabotage", { taskId: target.id }).catch(() => undefined); setSabotageCooldown(18); return; }
    setTasks((current) => current.map((task) => task.id === target.id ? { ...task, sabotaged: true } : task));
    setSabotageCooldown(18);
    showToast(t(`${target.short} sabotaged.`, `${taskCopy(target.id, language).short} חובל.`));
  };

  const placeTrap = () => {
    if (localRole !== "Cursed Pirate" || sabotageCooldown) return;
    if (online) { online.sendCommand("place-trap", { x: localPlayer.x, y: localPlayer.y }).catch(() => undefined); setSabotageCooldown(14); return; }
    setTraps((current) => [...current, { id: `trap-${Date.now()}`, x: localPlayer.x, y: localPlayer.y, active: true }]);
    setSabotageCooldown(14);
    showToast(t("A hidden snare waits in the sand.", "מלכודת נסתרת מחכה בחול."));
  };

  const chooseTreasure = (treasure: TreasureState) => {
    if (online) {
      online.sendCommand("choose-treasure", { treasureId: treasure.id }).catch(() => undefined);
      setOnlineTreasureOpen(false);
      return;
    }
    setTreasureTaken(treasure);
    if (treasure.cursed && localRole === "Pirate") {
      setPlayers((current) => current.map((player) => player.id === localPlayerId ? { ...player, role: "Cursed Pirate" } : player));
      setKillCooldown(6);
      showToast(t("The treasure chose you. You are cursed—silence the remaining crew.", "האוצר בחר בכם. אתם מקוללים — השתיקו את שאר הצוות."));
    } else if (localRole === "Pirate") showToast(t("The treasure is clean. Return to the Ship Deck and ring the bell.", "האוצר נקי. חזרו לסיפון וצלצלו בפעמון."));
    else showToast(t("The curse recognizes its own. Finish what you began.", "הקללה מזהה את שלה. סיימו את מה שהתחלתם."));
    setPhase("playing");
  };

  useEffect(() => {
    interactRef.current = interact;
    reportRef.current = reportBody;
  }, [interact, reportBody]);

  const moveJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * .31;
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(rawX, rawY);
    const scale = length > radius ? radius / length : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    joystickVector.current = { x: x / radius, y: y / radius };
    setJoystickKnob({ x, y });
  };

  const startJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    joystickPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveJoystick(event);
  };

  const stopJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    joystickPointer.current = null;
    joystickVector.current = { x: 0, y: 0 };
    setJoystickKnob({ x: 0, y: 0 });
  };

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const completedTasks = tasks.filter((task) => task.completed).length;

  if (phase === "lobby") {
    return (
      <main className={`launch-screen ${hebrew ? "rtl" : ""}`} dir={hebrew ? "rtl" : "ltr"} lang={language}>
        <button className="language-switch" onClick={() => setLanguage(hebrew ? "en" : "he")} aria-label={t("Switch to Hebrew", "החלפה לאנגלית")}><span>🌐</span>{hebrew ? "English" : "עברית"}</button>
        <button className="help-button" onClick={() => setHelpOpen(true)} aria-label={t("How to play", "איך משחקים")}>?</button>
        <div className="aurora aurora-gold" /><div className="aurora aurora-teal" />
        <section className="launch-content">
          <div className="brand-mark" aria-hidden="true"><div className="chest-lid" /><div className="chest-body"><span>◆</span></div><div className="curse-smoke">☠</div></div>
          <p className="kicker">{t("A PIRATE SOCIAL DEDUCTION GAME", "משחק הסקה חברתית פיראטי")}</p>
          <h1>{hebrew ? "התיבה המקוללת" : "Cursed Chest"}</h1>
          <p className="tagline">{t("Trust the crew. Find the keys.", "בטחו בצוות. מצאו את המפתחות.")}<br />{t("Fear what waits inside.", "פחדו ממה שמחכה בפנים.")}</p>
          <div className="crew-card"><div className="crew-stack" aria-hidden="true"><span className="crew-dot coral">☠</span><span className="crew-dot teal">☠</span><span className="crew-dot gold">☠</span></div><div><strong>{t("8 souls aboard", "8 נשמות על הסיפון")}</strong><small>{t("Seven AI crewmates. One or two are cursed.", "שבעה שחקני מחשב. אחד או שניים מקוללים.")}</small></div></div>
          <div className="how-to"><span><b>5</b> {t("keys", "מפתחות")}</span><i>{hebrew ? "←" : "→"}</i><span><b>1</b> {t("chest", "תיבה")}</span><i>{hebrew ? "←" : "→"}</i><span><b>?</b> {t("curse", "קללה")}</span></div>
          <div className="main-mode-actions">
            <button className="start-button" type="button" onClick={resetRound}><span>{t("START RAID · AI BOTS", "התחלת פשיטה · בוטים")}</span><b>{hebrew ? "‹" : "›"}</b></button>
            <button className="shop-button" type="button" onClick={() => setShopOpen(true)}><span>♛</span><strong>{t("OUTFIT SHOP", "חנות בגדים")}</strong><b>● {coins}</b></button>
            <button className="online-mode-button create" type="button" onClick={() => onOnlineChoice?.("create")}><span>⚓</span><strong>{t("CREATE ONLINE ROOM", "יצירת חדר אונליין")}</strong></button>
            <button className="online-mode-button join" type="button" onClick={() => onOnlineChoice?.("join")}><span>⌁</span><strong>{t("JOIN ONLINE ROOM", "הצטרפות לחדר אונליין")}</strong></button>
          </div>
          <p className="mode-note">{t("SOLO ALWAYS WORKS · ONLINE POWERED BY FIREBASE", "סולו תמיד זמין · אונליין מופעל באמצעות FIREBASE")}</p>
        </section>
        {helpOpen && <HowToPlayModal language={language} onClose={() => setHelpOpen(false)} />}
        {shopOpen && <OutfitShop language={language} coins={coins} owned={ownedOutfits} equipped={equippedOutfit} onBuy={buyOutfit} onEquip={equipOutfit} onClose={() => setShopOpen(false)} />}
      </main>
    );
  }

  return (
    <main className={`game-frame role-${localRole === "Pirate" ? "pirate" : "cursed"} ${hebrew ? "rtl" : ""}`} dir={hebrew ? "rtl" : "ltr"} lang={language}>
      <button className="language-switch in-game" onClick={() => setLanguage(hebrew ? "en" : "he")}><span>🌐</span>{hebrew ? "EN" : "עב"}</button>
      <button className="help-button in-game" onClick={() => setHelpOpen(true)} aria-label={t("How to play", "איך משחקים")}>?</button>
      {online && <button className="online-status-chip" onClick={onExit} aria-label={t("Leave online room", "יציאה מהחדר המקוון")}><i />{online.code}<span>{t("ONLINE", "מקוון")}</span></button>}
      <header className="game-hud">
        <div className="objective-copy"><span>{treasureTaken ? t("SECOND PHASE", "השלב השני") : t("CREW OBJECTIVE", "מטרת הצוות")}</span><strong>{treasureTaken ? (localRole === "Pirate" ? t("Ring the ship bell", "צלצלו בפעמון הספינה") : t("Thin the crew", "דללו את הצוות")) : t("Open the Cursed Chest", "פתחו את התיבה המקוללת")}</strong></div>
        <div className="hud-stats"><span className="clock">{time}</span><span className="task-pill">✓ {completedTasks}/{tasks.length}</span><span className={`key-pill ${chestPulse ? "pulse" : ""}`}>⚿ {deliveredCount} / 5</span></div>
        <div className="task-track"><span style={{ width: `${(tasks.filter((task) => task.completed).length / tasks.length) * 100}%` }} /></div>
      </header>

      <div className="world-viewport" ref={viewportRef}>
        <div className="world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <div className="ocean-texture" />
          <div className="ambient gulls">⌁ ⌁</div><div className="ambient reef-fish">‹·)))</div><div className="ambient wave-spark w1">≈</div><div className="ambient wave-spark w2">≈</div><div className="ambient shipwreck-art">⚑ ◢</div>
          <div className="path path-main" /><div className="path path-east" /><div className="path path-south" /><div className="path path-far-east" /><div className="path path-dock" /><div className="path path-northeast" /><div className="path path-blackreef" />
          <section className="map-area ship-deck" data-name="SHIP DECK"><div className="planks" /><span className="area-title">{t("Ship Deck", "סיפון הספינה")}</span><div className="ship-rail" /><div className="mast">⚑</div><div className="cannon c1">●</div><div className="cannon c2">●</div></section>
          <section className="map-area captain-cabin" data-name="CAPTAIN'S CABIN"><span className="area-title">{t("Captain's Cabin", "תא הקפטן")}</span><div className="desk">⌁</div><div className="rug">✦</div></section>
          <section className="map-area storage-room" data-name="STORAGE"><span className="area-title">{t("Storage", "מחסן")}</span><div className="crate-grid"><i /><i /><i /><i /></div><div className="barrel-row">● ● ●</div></section>
          <section className="map-area treasure-room" data-name="TREASURE ROOM"><span className="area-title">{t("Treasure Room", "חדר האוצר")}</span><div className="stone-ring" /></section>
          <section className="map-area cave" data-name="CAVE"><span className="area-title">{t("Moon Cave", "מערת הירח")}</span><div className="cave-mouth">◆</div><div className="crystals">♦ ♦</div></section>
          <section className="map-area beach" data-name="BEACH"><span className="area-title">{t("Whisper Beach", "חוף הלחישות")}</span><div className="palm-art p1">♠</div><div className="palm-art p2">♠</div><div className="boat">◒</div></section>
          <section className="map-area jungle-camp" data-name="JUNGLE CAMP"><span className="area-title">{t("Jungle Camp", "מחנה הג׳ונגל")}</span><div className="tent">▲</div><div className="campfire">♨</div><div className="jungle-crates">▣ ▣</div></section>
          <section className="map-area clifftop" data-name="CLIFFTOP LOOKOUT"><span className="area-title">{t("Clifftop Lookout", "מצפור הצוק")}</span><div className="lookout-compass">✥</div><div className="spyglass">⌕</div></section>
          <section className="map-area smuggler-dock" data-name="SMUGGLER'S DOCK"><span className="area-title">{t("Smuggler's Dock", "רציף המבריחים")}</span><div className="dock-planks" /><div className="dock-lanterns">♨ ♨ ♨</div><div className="dock-anchor">⚓</div></section>
          <section className="map-area ruined-fort" data-name="RUINED FORT"><span className="area-title">{t("Ruined Fort", "המצודה החרבה")}</span><div className="fort-wall"><i /><i /><i /><i /></div><div className="fort-flag">⚑</div><div className="powder-barrels">● ●</div></section>
          <section className="map-area blackreef" data-name="BLACKREEF SHORE"><span className="area-title">{t("Blackreef Shore", "חוף השונית השחורה")}</span><div className="black-rocks">▲ ▲ ▲</div><div className="tide-pool">≈</div><div className="bones">☠</div></section>

          <div className="ship-bell" style={{ left: BELL.x, top: BELL.y }}><span>♢</span><b>{t("SHIP BELL", "פעמון הספינה")}</b></div>
          <div className={`central-chest ${chestOpen ? "open" : ""} ${chestPulse ? "key-impact" : ""}`} style={{ left: CHEST.x, top: CHEST.y }}>
            <div className="chest-rays" />
            <div className="chest-top" /><div className="chest-bottom"><i>◆</i></div>
            <div className="inserted-keys">{keys.filter((key) => key.delivered).map((key, index) => <span key={key.id} style={{ color: key.color, transform: `rotate(${index * 36 - 72}deg)` }}>⚿</span>)}</div>
            <strong>{chestOpen ? t("OPEN", "פתוחה") : t(`${deliveredCount} / 5 KEYS`, `${deliveredCount} / 5 מפתחות`)}</strong>
            <div className="chest-meter" aria-label={t(`${deliveredCount} of 5 keys delivered`, `${deliveredCount} מתוך 5 מפתחות נמסרו`)}>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < deliveredCount ? "filled" : ""} />)}</div>
          </div>

          {tasks.map((task) => (
            <div key={task.id} className={`task-marker ${task.completed ? "complete" : ""} ${task.sabotaged ? "sabotaged" : ""}`} style={{ left: task.x, top: task.y }}>
              <span>{task.kind === "rope" ? "〰" : task.kind === "cannonballs" ? "●" : task.kind === "map" ? "⌁" : task.kind === "wheel" ? "✦" : task.kind === "coins" ? "●" : task.kind === "lanterns" ? "♨" : task.kind === "anchor" ? "⚓" : task.kind === "compass" ? "✥" : task.kind === "supplies" ? "▣" : "◇"}</span>
              <b>{task.completed ? t("DONE", "הושלם") : taskCopy(task.id, language).short}</b>
            </div>
          ))}
          {keys.filter((key) => !key.delivered && !key.carrierId).map((key) => <div key={key.id} className="world-key" style={{ left: key.x, top: key.y, color: key.color }}><span>⚿</span><b>{keyName(key.id, language)}</b></div>)}
          {traps.filter((trap) => trap.active).map((trap) => <div key={trap.id} className="world-trap" style={{ left: trap.x, top: trap.y }}>✣</div>)}
          {bodies.filter((body) => !body.reported).map((body) => <div key={body.id} className="fallen-player" style={{ left: body.x, top: body.y, "--body-color": body.color } as React.CSSProperties}><span>☠</span><b>{body.playerName}</b></div>)}
          {interactionTarget && <div className="interaction-ping" style={{ left: interactionTarget.x, top: interactionTarget.y }}><span>E</span><b>{t("INTERACT", "פעולה")}</b></div>}
          {players.filter((player) => player.alive).map((player) => <PirateAvatar key={player.id} player={player.isLocal ? { ...player, name: t("You", "אתם") } : player} outfit={player.isLocal ? equippedOutfit : "deckhand"} moving={player.isLocal ? localMoving : online?.motions[player.id]?.moving ?? distance(player, player.target) > 30} />)}
        </div>
      </div>

      <aside className={`carried-card ${carriedKey ? "has-key" : ""}`}><span>{carriedKey ? "⚿" : "◇"}</span><div><small>{t("CARRYING", "נושאים")}</small><strong>{carriedKey ? keyName(carriedKey.id, language) : t("No key", "ללא מפתח")}</strong></div>{carriedKey && <button onClick={dropKey}>{localRole === "Cursed Pirate" ? t("HIDE", "הסתרה") : t("DROP", "הנחה")}</button>}</aside>
      {toast && <div className="game-toast">{toast}</div>}

      <div className="touch-pad" aria-label={t("Analog movement joystick", "סטיק תנועה אנלוגי")} onPointerDown={startJoystick} onPointerMove={moveJoystick} onPointerUp={stopJoystick} onPointerCancel={stopJoystick}>
        <div className="joystick-ring" /><div className="joystick-knob" style={{ transform: `translate3d(${joystickKnob.x}px, ${joystickKnob.y}px, 0)` }}><span>☠</span></div>
      </div>
      <div className="action-stack">
        {localRole === "Cursed Pirate" && <div className="curse-actions"><button className="curse-button" disabled={Boolean(killCooldown) || !nearestBot || distance(localPlayer, nearestBot) > 88} onClick={eliminate}><span>☠</span>{killCooldown || t("STRIKE", "חיסול")}</button><button disabled={Boolean(sabotageCooldown)} onClick={sabotage}>⚠ {sabotageCooldown || t("SABOTAGE", "חבלה")}</button><button disabled={Boolean(sabotageCooldown)} onClick={placeTrap}>✣ {t("TRAP", "מלכודת")}</button></div>}
        <button className={`report-button ${canReport ? "ready" : ""}`} disabled={!canReport} onClick={reportBody}>⚑ {t("REPORT", "דיווח")}</button>
        <button className="interact-button" disabled={interaction.disabled} onClick={interact}><span>{interaction.label}</span><small>{interaction.disabled ? t("GET CLOSER", "התקרבו") : t("E · INTERACT", "E · פעולה")}</small></button>
      </div>

      {(phase === "reveal" || onlineReveal) && <div className="modal-layer role-layer"><div className={`role-card ${localRole === "Cursed Pirate" ? "cursed" : ""}`}><span className="modal-kicker">{t("YOUR SECRET ROLE", "התפקיד הסודי שלכם")}</span><div className={`role-character-preview outfit-${equippedOutfit}`} style={{ "--pirate-color": localPlayer.color } as React.CSSProperties}><div className="preview-hat">{OUTFITS.find((item) => item.id === equippedOutfit)?.icon || "☠"}</div><div className="preview-head"><i /><i /></div><div className="preview-body">{OUTFITS.find((item) => item.id === equippedOutfit)?.icon || "☠"}</div><strong>{t("YOU", "הדמות שלכם")}</strong></div><div className="role-emblem">{localRole === "Pirate" ? "⚓" : "☠"}</div><span className="you-are">{t("YOU ARE", "אתם")}</span><h2>{localRole === "Pirate" ? t("Pirate", "פיראט") : t("Cursed", "מקולל")}</h2><p>{localRole === "Pirate" ? t("Complete tasks, recover the five keys, and watch for betrayal.", "השלימו משימות, החזירו את חמשת המפתחות והיזהרו מבגידה.") : t("Blend in. Hide keys, sabotage work, trap paths, and silence the crew.", "היטמעו בצוות. הסתירו מפתחות, חבלו במשימות, הניחו מלכודות והשתיקו את הצוות.")}</p><button className="modal-primary" onClick={() => online ? setOnlineReveal(false) : setPhase("playing")}>{t("KEEP IT SECRET", "שמרו את הסוד")}</button></div></div>}
      {activeTask && <TaskMiniGame task={activeTask} cursed={localRole === "Cursed Pirate"} language={language} onClose={() => setActiveTask(null)} onFinish={finishTask} />}
      {phase === "meeting" && (online && onlineMeeting ? <OnlineMeetingModal meeting={onlineMeeting} players={players} localPlayerId={localPlayerId} language={language} onChat={(text) => online.sendCommand("meeting-chat", { text }).catch(() => undefined)} onVote={(targetId) => online.sendCommand("meeting-vote", { targetId }).catch(() => undefined)} /> : <MeetingModal players={players} reporter={reporter} language={language} onResolve={(id) => resolveMeeting(id)} />)}
      {(phase === "treasure" || onlineTreasureOpen) && <TreasureModal treasures={treasures} language={language} onChoose={chooseTreasure} />}
      {phase === "ended" && endState && <div className="modal-layer end-layer"><div className={`end-card ${endState.win ? "win" : "loss"}`}><span className="end-icon">{endState.win ? "♛" : "☠"}</span><span className="modal-kicker">{t("ROUND COMPLETE", "הסיבוב הסתיים")}</span><h2>{endState.title}</h2><p>{endState.detail}</p><div className="round-summary"><span><b>{deliveredCount}</b> {t("keys", "מפתחות")}</span><span><b>{tasks.filter((task) => task.completed).length}</b> {t("tasks", "משימות")}</span><span><b>{players.filter((player) => player.alive).length}</b> {t("survived", "שרדו")}</span></div>{roundReward && <div className="reward-card"><strong>● +{roundReward.total}</strong><span>{t("Pirate win", "ניצחון כפיראט")} +{roundReward.win} · {t("Rounds survived", "סיבובים ששרדתם")} +{roundReward.survival} · {t("Eliminations", "חיסולים")} +{roundReward.kills}</span></div>}<button className="modal-primary" onClick={resetRound}>{online ? t("BACK TO ONLINE LOBBY", "חזרה ללובי המקוון") : t("PLAY AGAIN", "שחקו שוב")}</button><button className="text-button" onClick={() => online ? resetRound() : setPhase("lobby")}>{t("BACK TO TITLE", "חזרה למסך הראשי")}</button></div></div>}
      {helpOpen && <HowToPlayModal language={language} onClose={() => setHelpOpen(false)} />}
    </main>
  );
}
