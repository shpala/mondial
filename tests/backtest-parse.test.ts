import { describe, expect, it } from "vitest";
import { parseResults } from "@/lib/backtest/parse";

const CSV = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2018-07-15,France,Croatia,4,2,FIFA World Cup,Moscow,Russia,TRUE
2014-06-01,Brazil,Argentina,2,1,Friendly,Rio,Brazil,FALSE
2026-06-27,Panama,England,NA,NA,FIFA World Cup,East Rutherford,United States,TRUE`;

describe("parseResults", () => {
  it("keeps played rows, drops NA fixtures, and sorts by date", () => {
    const rows = parseResults(CSV);
    expect(rows).toHaveLength(2); // Panama–England (NA) dropped
    expect(rows[0].date).toBe("2014-06-01"); // sorted ascending
    expect(rows[1].home).toBe("France");
  });

  it("parses scores as numbers and neutral as a boolean", () => {
    const rows = parseResults(CSV);
    const fra = rows.find((r) => r.home === "France")!;
    expect(fra.homeGoals).toBe(4);
    expect(fra.awayGoals).toBe(2);
    expect(fra.neutral).toBe(true);
    const bra = rows.find((r) => r.home === "Brazil")!;
    expect(bra.neutral).toBe(false);
    expect(bra.tournament).toBe("Friendly");
  });
});
