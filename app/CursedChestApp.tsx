"use client";

import { useState } from "react";
import CursedChestGame from "./game/CursedChestGame";
import MultiplayerFlow from "./multiplayer/MultiplayerFlow";

export default function CursedChestApp() {
  const [onlineIntent, setOnlineIntent] = useState<"create" | "join" | null>(null);
  if (onlineIntent) return <MultiplayerFlow initialIntent={onlineIntent} onExit={() => setOnlineIntent(null)} />;
  return <CursedChestGame onOnlineChoice={setOnlineIntent} />;
}

