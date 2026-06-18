// Deterministic squad + lineup generators. Used as the universal fallback when
// a live source has no squad/lineup data, for any Team (keyed by team.id so the
// output is stable). Pure — no I/O.

import type { Lineup, Player, Position, Squad, Team } from "@/lib/types";
import { mulberry32 } from "@/lib/rng";

const FIRST_NAMES = [
  "Luca", "Mateo", "Noah", "Adam", "Youssef", "Diego", "Kai", "Hugo", "Omar",
  "Leon", "Ivan", "Marco", "Andre", "Felix", "Carlos", "Tomas", "Ali", "Bruno",
  "Sami", "Daniel", "Mehdi", "Niko", "Pedro", "Jonas", "Viktor", "Kofi",
  "Hiro", "Min", "Sven", "Pablo",
];
const LAST_NAMES = [
  "Silva", "Hassan", "Kovac", "Martin", "Nakamura", "Okafor", "Andersen",
  "Rossi", "Diallo", "Vargas", "Schmidt", "Kim", "Haddad", "Novak", "Mensah",
  "Lopez", "Petrov", "Bauer", "Costa", "Yamamoto", "Traore", "Larsen",
  "Romero", "Cohen", "Dubois", "Marquez", "Ferreira", "Eriksen", "Bouchard",
  "Khan",
];
const CLUBS = [
  "Manchester City", "Real Madrid", "Bayern Munich", "Paris SG", "Liverpool",
  "Inter", "Arsenal", "Barcelona", "Juventus", "Chelsea", "Atletico Madrid",
  "Dortmund", "Napoli", "Tottenham", "Benfica", "Ajax", "Porto", "Marseille",
  "Sporting", "Leverkusen", "Al Hilal", "LAFC", "Galatasaray", "Feyenoord",
];

const POSITION_PLAN: Position[] = [
  ...Array<Position>(3).fill("GK"),
  ...Array<Position>(8).fill("DEF"),
  ...Array<Position>(8).fill("MID"),
  ...Array<Position>(7).fill("FWD"),
]; // 26

export function generateSquad(team: Team): Squad {
  const rng = mulberry32(team.id * 7919 + 13);
  const players: Player[] = POSITION_PLAN.map((position, i) => {
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const club = CLUBS[Math.floor(rng() * CLUBS.length)];
    return {
      id: team.id * 100 + i,
      name: `${first} ${last}`,
      number: i + 1,
      position,
      club,
      age: 21 + Math.floor(rng() * 14),
    };
  });
  return { team, players, source: "generated" };
}

const FORMATIONS = ["4-3-3", "4-2-3-1", "3-5-2", "4-4-2"];

export function gridForFormation(formation: string): string[] {
  const lines = formation.split("-").map((n) => parseInt(n, 10));
  const grid: string[] = ["1:1"]; // GK
  let row = 2;
  for (const count of lines) {
    for (let col = 1; col <= count; col++) grid.push(`${row}:${col}`);
    row++;
  }
  return grid;
}

export function generateLineup(team: Team): Lineup {
  const squad = generateSquad(team);
  const rng = mulberry32(team.id * 31 + 5);
  const formation = FORMATIONS[Math.floor(rng() * FORMATIONS.length)];
  const grids = gridForFormation(formation);

  const def = squad.players.filter((p) => p.position === "DEF");
  const mid = squad.players.filter((p) => p.position === "MID");
  const fwd = squad.players.filter((p) => p.position === "FWD");
  const gk = squad.players.filter((p) => p.position === "GK");

  const lines = formation.split("-").map((n) => parseInt(n, 10));
  const xi: Player[] = [gk[0]];
  const pools = [def, mid, fwd];
  const cursor = [0, 0, 0];
  let poolIdx = 0;
  for (const count of lines) {
    for (let i = 0; i < count; i++) {
      const idx = Math.min(poolIdx, pools.length - 1);
      const p = pools[idx][cursor[idx]++] ?? mid[0];
      xi.push(p);
    }
    poolIdx++;
  }

  const startXI = xi.slice(0, 11).map((player, i) => ({
    player,
    grid: grids[i] ?? null,
  }));
  const usedIds = new Set(startXI.map((s) => s.player.id));
  const substitutes = squad.players
    .filter((p) => !usedIds.has(p.id))
    .slice(0, 12);

  return { team, formation, coach: null, startXI, substitutes, source: "generated" };
}
