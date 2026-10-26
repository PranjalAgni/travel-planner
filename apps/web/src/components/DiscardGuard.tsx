"use client";

import { useCallback, useState } from "react";
import { isBlankDraft } from "@/lib/trip";
import { getTrip, saveCurrentTrip } from "@/lib/trip-store";
import { buttonClass, Modal } from "./Modal";

/**
 * Wraps actions that replace the open trip. Saved trips are kept by autosave, so this
 * only asks when an unsaved trip with content would be thrown away.
 */
export function useDiscardGuard() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reads the store at call time, so it is safe in effects and async callbacks.
  const guard = useCallback((action: () => void) => {
    const trip = getTrip();
    if (!trip.savedId && !isBlankDraft(trip.draft)) {
      setFailed(false);
      setPending(() => action);
    } else action();
  }, []);

  const finish = () => {
    pending?.();
    setPending(null);
  };

  const dialog = (
    <Modal
      open={pending !== null}
      onClose={() => setPending(null)}
      title="Keep your current trip?"
      footer={
        <>
          <button type="button" className={buttonClass.secondary} onClick={() => setPending(null)}>
            Cancel
          </button>
          <button type="button" className={buttonClass.secondary} onClick={finish}>
            Discard it
          </button>
          <button
            type="button"
            className={buttonClass.primary}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveCurrentTrip();
                finish();
              } catch {
                setFailed(true);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save it first"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">The trip you are working on has not been saved. Save it to My trips, or discard it?</p>
      {failed && <p className="mt-2 text-sm text-rose-700">Saving failed. Your browser may be blocking storage.</p>}
    </Modal>
  );

  return { guard, dialog };
}
