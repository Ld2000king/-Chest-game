import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Cursed Chest launch screen and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Cursed Chest — Pirate Social Deduction<\/title>/i);
  assert.match(html, /A PIRATE SOCIAL DEDUCTION GAME/);
  assert.match(html, /START RAID/);
  assert.match(html, /Switch to Hebrew/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /mobile-web-app-capable/);
  assert.match(html, /property="og:image" content="https:\/\/cursed-chest-raid\.l2pro4u\.chatgpt\.site\/og.png"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships the playable loop, Hebrew localization, and branded preview", async () => {
  const [gameSource, dataSource, preview] = await Promise.all([
    readFile(new URL("../app/game/CursedChestGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/data.ts", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(gameSource, /Cursed Pirate/);
  assert.match(gameSource, /MeetingModal/);
  assert.match(gameSource, /TreasureModal/);
  assert.match(gameSource, /discussionLeft.*20/);
  assert.match(gameSource, /meeting-chat/);
  assert.match(gameSource, /role-character-preview/);
  assert.match(gameSource, /type BotIntent/);
  assert.match(gameSource, /brain\.intent = "hide"/);
  assert.match(gameSource, /remainingPirates/);
  assert.match(gameSource, /interaction-ping/);
  assert.match(gameSource, /Skip vote/);
  assert.match(gameSource, /triggeredTraps/);
  assert.match(gameSource, /HowToPlayModal/);
  assert.match(gameSource, /Ruined Fort/);
  assert.match(gameSource, /Blackreef Shore/);
  assert.match(dataSource, /width: 1900, height: 1300/);
  assert.match(gameSource, /Smuggler's Dock/);
  assert.match(gameSource, /Clifftop Lookout/);
  assert.match(gameSource, /language === "he"/);
  assert.match(gameSource, /התיבה המקוללת/);
  assert.match(dataSource, /createKeys/);
  assert.match(dataSource, /createTasks/);
  assert.match(dataSource, /createTreasures/);
  assert.match(dataSource, /task-lanterns/);
  assert.match(dataSource, /task-anchor/);
  assert.match(dataSource, /task-compass/);
  assert.match(dataSource, /task-supplies/);
  assert.equal(preview, undefined);
});

test("ships an installable offline-capable PWA", async () => {
  const [manifestSource, workerSource, registerSource, icon192, icon512, appleIcon] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/PwaRegister.tsx", import.meta.url), "utf8"),
    access(new URL("../public/pwa-192.png", import.meta.url)),
    access(new URL("../public/pwa-512.png", import.meta.url)),
    access(new URL("../public/apple-touch-icon.png", import.meta.url)),
  ]);

  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.icons.length, 2);
  assert.match(workerSource, /cursed-chest-v2/);
  assert.match(workerSource, /offline\.html/);
  assert.match(registerSource, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.equal(icon192, undefined);
  assert.equal(icon512, undefined);
  assert.equal(appleIcon, undefined);
});

test("ships the Firebase online room and synchronized match flow without embedding credentials", async () => {
  const [flowSource, firebaseSource, gameSource, rulesSource, envExample, packageSource] = await Promise.all([
    readFile(new URL("../app/multiplayer/MultiplayerFlow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/multiplayer/firebaseClient.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/CursedChestGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../firebase.database.rules.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(flowSource, /Create a room/);
  assert.match(flowSource, /Join a room/);
  assert.match(flowSource, /START ONLINE RAID/);
  assert.match(flowSource, /FILL TO 8 WITH AI/);
  assert.match(firebaseSource, /signInAnonymously/);
  assert.match(firebaseSource, /getDatabase/);
  assert.match(firebaseSource, /onDisconnect/);
  assert.match(firebaseSource, /startOnlineMatch/);
  assert.match(firebaseSource, /roomSecrets/);
  assert.match(gameSource, /meeting-chat/);
  assert.match(gameSource, /meeting-vote/);
  assert.match(gameSource, /publicMatchSnapshot/);
  assert.match(gameSource, /publishMotion/);
  assert.match(rulesSource, /auth\.uid/);
  assert.match(rulesSource, /roomSecrets/);
  assert.match(envExample, /NEXT_PUBLIC_FIREBASE_DATABASE_URL=/);
  assert.doesNotMatch(envExample, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(packageSource, /"firebase"/);
});
