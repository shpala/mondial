"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Overrides } from "@/lib/prediction";

let storageOk = true;
/** False once a localStorage write has failed (private mode / quota), so the UI
 *  can warn that picks won't survive a reload instead of failing silently. */
export const bracketStorageOk = () => storageOk;

// Wrap localStorage so a throwing setItem (private mode, full quota) degrades
// gracefully and is detectable, rather than being swallowed silently.
const guardedStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      storageOk = false;
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
}));

interface BracketState {
  overrides: Overrides;
  /** Snapshot of the overrides cleared by the last reset(), for one-step undo. */
  lastCleared: Overrides | null;
  /** Pick a winner for a matchup. Picking the current winner clears the override. */
  pick: (matchupId: string, teamId: number) => void;
  /** Clear every pick, stashing them so the action can be undone. */
  reset: () => void;
  /** Restore the picks cleared by the most recent reset(). */
  undoReset: () => void;
}

export const useBracketStore = create<BracketState>()(
  persist(
    (set) => ({
      overrides: {},
      lastCleared: null,
      pick: (matchupId, teamId) =>
        set((state) => {
          const next = { ...state.overrides };
          if (next[matchupId] === teamId) {
            delete next[matchupId];
          } else {
            next[matchupId] = teamId;
          }
          // A fresh pick invalidates any pending undo.
          return { overrides: next, lastCleared: null };
        }),
      reset: () =>
        set((state) => ({ overrides: {}, lastCleared: state.overrides })),
      undoReset: () =>
        set((state) =>
          state.lastCleared
            ? { overrides: state.lastCleared, lastCleared: null }
            : state,
        ),
    }),
    {
      name: "mondial-bracket-v1",
      storage: guardedStorage,
      // Only the picks themselves persist — the undo snapshot is per-session.
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
