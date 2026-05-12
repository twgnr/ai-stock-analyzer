/**
 * Zweistufiger DCF mit Terminal Value (Gordon-Growth).
 *
 *  FCF_t = FCF_0 × (1 + g)^t                      für t = 1..N
 *  TV    = FCF_N × (1 + g_terminal) / (WACC − g_terminal)
 *  EV    = Σ FCF_t / (1+WACC)^t  +  TV / (1+WACC)^N
 *  Equity = EV − Net-Debt
 *  Fair-Value je Aktie = Equity / Shares-Outstanding
 *
 * Reverse-DCF: gegeben Kurs, shares, wacc, years, terminal-growth →
 * welches initialGrowth macht das Modell konsistent?
 */

export interface DcfInputs {
  initialFcf: number; // aktuelle Free-Cashflow-Basis
  sharesOutstanding: number;
  netDebt: number; // Gesamt-Schulden − Cash
  years: number; // Prognosephase, typischerweise 5-10
  initialGrowthPct: number; // z.B. 8  (Bull) / 4 (Base) / 1 (Bear)
  terminalGrowthPct: number; // typischerweise 2-3 (≈ langfristige Inflation)
  waccPct: number; // z.B. 8-12
}

export interface DcfBreakdownPoint {
  year: number;
  fcf: number;
  pvFcf: number;
}

export interface DcfResult {
  inputs: DcfInputs;
  fairValuePerShare: number;
  enterpriseValue: number;
  equityValue: number;
  terminalValue: number;
  pvOfTerminalValue: number;
  breakdown: DcfBreakdownPoint[];
  warnings: string[];
}

export function runDcf(inputs: DcfInputs): DcfResult {
  const warnings: string[] = [];
  const {
    initialFcf,
    sharesOutstanding,
    netDebt,
    years,
    initialGrowthPct,
    terminalGrowthPct,
    waccPct,
  } = inputs;
  const g = initialGrowthPct / 100;
  const gt = terminalGrowthPct / 100;
  const w = waccPct / 100;

  if (w <= gt) {
    warnings.push(
      "WACC muss größer als Terminal-Growth sein — Ergebnis nicht verwertbar"
    );
  }
  if (sharesOutstanding <= 0) {
    warnings.push("Shares-Outstanding ≤ 0 — Fair-Value nicht berechenbar");
  }

  const breakdown: DcfBreakdownPoint[] = [];
  let sumPv = 0;
  let fcf = initialFcf;
  for (let t = 1; t <= years; t++) {
    fcf = fcf * (1 + g);
    const pv = fcf / Math.pow(1 + w, t);
    sumPv += pv;
    breakdown.push({ year: t, fcf, pvFcf: pv });
  }

  const terminalValue =
    w > gt ? (fcf * (1 + gt)) / (w - gt) : 0;
  const pvTerminal = terminalValue / Math.pow(1 + w, years);
  const enterpriseValue = sumPv + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const fairValuePerShare =
    sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;

  return {
    inputs,
    fairValuePerShare,
    enterpriseValue,
    equityValue,
    terminalValue,
    pvOfTerminalValue: pvTerminal,
    breakdown,
    warnings,
  };
}

export interface ReverseDcfInputs {
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
  initialFcf: number;
  years: number;
  terminalGrowthPct: number;
  waccPct: number;
}

export interface ReverseDcfResult {
  impliedGrowthPct: number | null;
  interpretation: string;
  iterations: number;
}

/**
 * Finde das implizite initialGrowth per Bisection, sodass
 * Fair-Value = currentPrice.
 */
export function runReverseDcf(inputs: ReverseDcfInputs): ReverseDcfResult {
  const target = inputs.currentPrice * inputs.sharesOutstanding + inputs.netDebt;
  // Target: Enterprise-Value
  if (inputs.sharesOutstanding <= 0 || inputs.currentPrice <= 0) {
    return {
      impliedGrowthPct: null,
      interpretation: "Fehlende Kurs- oder Shares-Outstanding-Daten",
      iterations: 0,
    };
  }
  if (inputs.waccPct / 100 <= inputs.terminalGrowthPct / 100) {
    return {
      impliedGrowthPct: null,
      interpretation: "WACC muss größer als Terminal-Growth sein",
      iterations: 0,
    };
  }

  function evAt(gPct: number): number {
    const r = runDcf({
      initialFcf: inputs.initialFcf,
      sharesOutstanding: inputs.sharesOutstanding,
      netDebt: inputs.netDebt,
      years: inputs.years,
      initialGrowthPct: gPct,
      terminalGrowthPct: inputs.terminalGrowthPct,
      waccPct: inputs.waccPct,
    });
    return r.enterpriseValue;
  }

  // Bisection in [−30, +50] %
  let lo = -30;
  let hi = 50;
  const evLo = evAt(lo);
  const evHi = evAt(hi);
  if (target < Math.min(evLo, evHi) || target > Math.max(evLo, evHi)) {
    return {
      impliedGrowthPct: null,
      interpretation:
        "Impliziertes Wachstum liegt außerhalb −30%/+50%. Kurs ist relativ zum Modell extrem.",
      iterations: 0,
    };
  }
  // Monotonie: bei evLo < evHi steigt EV mit g
  const asc = evLo < evHi;

  let it = 0;
  while (hi - lo > 0.01 && it < 200) {
    const mid = (lo + hi) / 2;
    const evMid = evAt(mid);
    if (asc) {
      if (evMid < target) lo = mid;
      else hi = mid;
    } else {
      if (evMid > target) lo = mid;
      else hi = mid;
    }
    it++;
  }

  const g = (lo + hi) / 2;
  let interpretation = "";
  if (g >= 15) interpretation = "Aggressives Wachstum ist im Kurs eingepreist";
  else if (g >= 8) interpretation = "Überdurchschnittliches Wachstum eingepreist";
  else if (g >= 4) interpretation = "Moderates Wachstum eingepreist";
  else if (g >= 0)
    interpretation = "Konservative Erwartung — Value-tauglich wenn Qualität stimmt";
  else interpretation = "Markt impliziert Schrumpfung — Turnaround-Wette";

  return {
    impliedGrowthPct: g,
    interpretation,
    iterations: it,
  };
}
