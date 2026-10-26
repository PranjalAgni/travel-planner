"use client";

import { useEffect, useState } from "react";
import { isShareHash, readShareHash, ShareLinkError } from "@/lib/trip-share";
import { openSharedTrip } from "@/lib/trip-store";
import { useDiscardGuard } from "./DiscardGuard";

/** Opens trips from `#trip=` share links, on load and when a link is pasted into an open tab. */
export function useSharedLinkReceiver() {
  const { guard, dialog } = useDiscardGuard();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function receive() {
      const hash = location.hash;
      if (!isShareHash(hash)) return;
      // Drop the link from the address bar so a refresh does not open it again.
      history.replaceState(null, "", location.pathname + location.search);
      try {
        const shared = await readShareHash(hash);
        setError(null);
        guard(() => openSharedTrip(shared));
      } catch (err) {
        setError(err instanceof ShareLinkError ? err.message : "This share link could not be opened.");
      }
    }
    void receive();
    window.addEventListener("hashchange", receive);
    return () => window.removeEventListener("hashchange", receive);
  }, [guard]);

  return { dialog, error, dismissError: () => setError(null) };
}
