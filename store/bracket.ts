"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Overrides } from "@/lib/prediction";

interface BracketState {
  overrides: Overrides;
  /** Pick a winner for a matchup. Picking the current winner clears the override. */
  pick: (matchupId: string, teamId: number) => void;
  reset: () => void;
}

export const useBracketStore = create<BracketState>()(
  persist(
    (set) => ({
      overrides: {},
      pick: (matchupId, teamId) =>
        set((state) => {
          const next = { ...state.overrides };
          if (next[matchupId] === teamId) {
            delete next[matchupId];
          } else {
            next[matchupId] = teamId;
          }
          return { overrides: next };
        }),
      reset: () => set({ overrides: {} }),
    }),
    { name: "mondial-bracket-v1" },
  ),
);
