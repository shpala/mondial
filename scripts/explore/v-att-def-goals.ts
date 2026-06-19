/**
 * Attack/Defence Goals Decomposition model.
 *
 * Beyond standard Elo (which updates only on W/D/L), this variant separately
 * tracks an attack residual and a defence-weakness residual per team, derived
 * from goals scored/conceded vs Poisson expectation. At prediction time these
 * compound: a sharp attack meeting a porous defence gets a bigger boost.
 *
 * Knobs: nu, home_bump, k, scale, kAtt, kDef, attW, defW, decay
 * Tuned to minimise wc2022 log-loss; wc2026 is read out-of-sample.
 */

import {
  loadCorpus,
  eloUpdateScaled,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  INIT,
  type Tuple,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";
import { goalRates } from "@/lib/scoreline";

interface Config {
  nu: number;
  home: number;  // home/host bump
  k: number;
  scale: number;
  kAtt: number;  // learning rate for attack residual
  kDef: number;  // learning rate for defence-weakness residual
  attW: number;  // weight of attack residual in effective rating
  defW: number;  // weight of defence-weakness residual in effective rating
  decay: number; // per-match decay for residuals (0..1)
}

const matches = loadCorpus();

function rollAttDef(cfg: Config): Tuple[] {
  const rating = new Map<string, number>();
  const att = new Map<string, number>(); // attack residual
  const def = new Map<string, number>(); // defence-weakness residual

  const atMap = (m: Map<string, number>, t: string) => m.get(t) ?? 0;
  const rat = (t: string) => rating.get(t) ?? INIT;

  const tuples: Tuple[] = [];

  for (const m of matches) {
    const ratHome = rat(m.home);
    const ratAway = rat(m.away);

    const attHome = atMap(att, m.home);
    const defHome = atMap(def, m.home);
    const attAway = atMap(att, m.away);
    const defAway = atMap(def, m.away);

    // Effective ratings include attack and opponent's defence weakness
    const homeBump = m.neutral ? 0 : cfg.home;
    const effHome = ratHome + homeBump + cfg.attW * attHome + cfg.defW * defAway;
    const effAway = ratAway + cfg.attW * attAway + cfg.defW * defHome;

    tuples.push({
      date: m.date,
      home: m.home,
      away: m.away,
      effHome,
      effAway,
      ratHome,
      ratAway,
      neutral: m.neutral,
      hg: m.homeGoals,
      ag: m.awayGoals,
      tournament: m.tournament,
    });

    // Standard Elo update
    const d = eloUpdateScaled(effHome, effAway, m.homeGoals, m.awayGoals, cfg.k, cfg.scale);
    rating.set(m.home, ratHome + d);
    rating.set(m.away, ratAway - d);

    // Compute expected goals
    const { lambdaHome, lambdaAway } = goalRates(effHome, effAway);

    // Goal residuals: actual - expected
    const resH = m.homeGoals - lambdaHome;
    const resA = m.awayGoals - lambdaAway;

    // Decay and update attack/defence residuals
    att.set(m.home, attHome * cfg.decay + cfg.kAtt * resH);
    def.set(m.away, defAway * cfg.decay + cfg.kDef * resH);
    att.set(m.away, attAway * cfg.decay + cfg.kAtt * resA);
    def.set(m.home, defHome * cfg.decay + cfg.kDef * resA);
  }

  return tuples;
}

function evaluate(cfg: Config) {
  const tuples = rollAttDef(cfg);
  const predict = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, cfg.nu, cfg.scale);
  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// Baseline reference numbers (from prompt)
const BASELINE_FULL = 0.8959;
const BASELINE_WC2026 = 1.0929;
const FULL_RED_FLAG = BASELINE_FULL + 0.003; // 0.8989

// Recipe wc2022-tuned config (from spec - verified)
const recipeCfg: Config = {
  nu: 0.75,
  home: 70,
  k: 35,
  scale: 350,
  kAtt: 0.2,
  kDef: 0.5,
  attW: 5,
  defW: 5,
  decay: 0.99,
};

console.log("Recipe wc2022-tuned config:");
const recipeR = evaluate(recipeCfg);
console.log(JSON.stringify({ cfg: recipeCfg, ...recipeR }, null, 2));

// Start with the recipe best
let bestLoss = recipeR.wc2022.logLoss;
let bestFound: Config = recipeCfg;

// Broad sweep across the main hyperparameter space
// Constraint: full log-loss must stay within red-flag threshold
console.log("\nSweep (constrained: full <= red-flag threshold)...");

for (const nu of [0.65, 0.7, 0.75, 0.8, 0.85]) {
  for (const home of [60, 70, 80, 87.5]) {
    for (const k of [30, 35, 40, 45]) {
      for (const scale of [300, 325, 350, 375]) {
        for (const attW of [3, 5, 7]) {
          for (const defW of [3, 5, 7]) {
            for (const kAtt of [0.1, 0.2, 0.3]) {
              for (const kDef of [0.3, 0.5, 0.7]) {
                for (const decay of [0.97, 0.99]) {
                  const cfg: Config = { nu, home, k, scale, kAtt, kDef, attW, defW, decay };
                  const r = evaluate(cfg);
                  if (r.full.logLoss <= FULL_RED_FLAG && r.wc2022.logLoss < bestLoss) {
                    bestLoss = r.wc2022.logLoss;
                    bestFound = { ...cfg };
                    console.log(
                      `New best: wc2022=${r.wc2022.logLoss.toFixed(4)} full=${r.full.logLoss.toFixed(4)} wc2026=${r.wc2026.logLoss.toFixed(4)} cfg=${JSON.stringify(cfg)}`
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log("\n=== CHOSEN CONFIG ===");
const finalResult = evaluate(bestFound);
const output = {
  chosen: bestFound,
  full: finalResult.full,
  wc2022: finalResult.wc2022,
  wc2026: finalResult.wc2026,
};
console.log(JSON.stringify(output, null, 2));
console.log(`\nBaseline: full=${BASELINE_FULL} wc2026=${BASELINE_WC2026}`);
console.log(`Generalizes (wc2026 < baseline): ${finalResult.wc2026.logLoss < BASELINE_WC2026}`);
