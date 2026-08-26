"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || ["localhost", "127.0.0.1"].includes(window.location.hostname)) return;

    const register = () => {
      navigator.serviceWorker.register(new URL("sw.js", document.baseURI).pathname).catch(() => {
        // The game remains fully playable online if registration is unavailable.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
