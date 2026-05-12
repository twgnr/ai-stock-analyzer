/**
 * Fundamental-Scoring-Modelle auf Basis der annualen Financials + aktuellem Kurs.
 *
 * Quellen:
 *  - Piotroski, J. (2000). Value Investing: The Use of Historical Financial
 *    Statement Information to Separate Winners from Losers. JAR.
 *  - Altman, E. (1968). Financial Ratios, Discriminant Analysis, and the
 *    Prediction of Corporate Bankruptcy. JoF.
 *  - Beneish, M. D. (1999). The Detection of Earnings Manipulation. FAJ.
 *  - Graham & Dodd (1934), Intelligent Investor (1949).
 *
 * Alle Metriken sind best-effort — wenn Einzelwerte fehlen, wird das
 * entsprechende Einzelkriterium mit `null` beantwortet statt den Gesamt-Score
 * zu werfen. Konsument zeigt „n/a".
 */

import type { FinancialRow } from "./yahoo";

export interface PiotroskiCriterion {
  key: string;
  label: string;
  passed: boolean | null;
  value?: string;
}

export interface PiotroskiResult {
  score: number;
  maxScore: number;
  criteria: PiotroskiCriterion[];
  label: string;
  applicable: boolean;
}

function labelFromScore(s: number): string {
  if (s >= 7) return "stark";
  if (s >= 4) return "mittel";
  if (s >= 0) return "schwach";
  return "n/a";
}

export function computePiotroski(
  annual: FinancialRow[]
): PiotroskiResult {
  // Braucht mindestens zwei Jahre für y/y-Vergleiche.
  if (annual.length < 2) {
    return {
      score: 0,
      maxScore: 9,
      criteria: [],
      label: "n/a",
      applicable: false,
    };
  }
  const y0 = annual[0]; // aktuell (neuestes)
  const y1 = annual[1]; // Vorjahr

  const criteria: PiotroskiCriterion[] = [];

  function pass(
    key: string,
    label: string,
    passed: boolean | null,
    value?: string
  ): PiotroskiCriterion {
    return { key, label, passed, value };
  }

  // Profitabilität (4)
  const roa0 =
    y0.netIncome != null && y0.totalAssets
      ? y0.netIncome / y0.totalAssets
      : null;
  const roa1 =
    y1.netIncome != null && y1.totalAssets
      ? y1.netIncome / y1.totalAssets
      : null;
  criteria.push(
    pass(
      "netIncome",
      "Net Income > 0",
      y0.netIncome != null ? y0.netIncome > 0 : null,
      y0.netIncome != null ? (y0.netIncome / 1e6).toFixed(0) + "M" : undefined
    )
  );
  criteria.push(
    pass(
      "ocf",
      "Operating Cashflow > 0",
      y0.operatingCashflow != null ? y0.operatingCashflow > 0 : null,
      y0.operatingCashflow != null
        ? (y0.operatingCashflow / 1e6).toFixed(0) + "M"
        : undefined
    )
  );
  criteria.push(
    pass(
      "roaUp",
      "ROA vs. Vorjahr gestiegen",
      roa0 != null && roa1 != null ? roa0 > roa1 : null,
      roa0 != null ? (roa0 * 100).toFixed(1) + "%" : undefined
    )
  );
  criteria.push(
    pass(
      "accruals",
      "OCF > Net Income (Qualität)",
      y0.operatingCashflow != null && y0.netIncome != null
        ? y0.operatingCashflow > y0.netIncome
        : null
    )
  );

  // Leverage / Liquidität (3)
  const ltd0 = y0.longTermDebt;
  const ltd1 = y1.longTermDebt;
  criteria.push(
    pass(
      "debtDown",
      "Long-Term-Debt vs. Vorjahr gesunken",
      ltd0 != null && ltd1 != null ? ltd0 <= ltd1 : null
    )
  );
  const cr0 =
    y0.totalCurrentAssets != null && y0.totalCurrentLiabilities
      ? y0.totalCurrentAssets / y0.totalCurrentLiabilities
      : null;
  const cr1 =
    y1.totalCurrentAssets != null && y1.totalCurrentLiabilities
      ? y1.totalCurrentAssets / y1.totalCurrentLiabilities
      : null;
  criteria.push(
    pass(
      "currentRatioUp",
      "Current Ratio vs. Vorjahr gestiegen",
      cr0 != null && cr1 != null ? cr0 > cr1 : null,
      cr0 != null ? cr0.toFixed(2) : undefined
    )
  );
  const issued = y0.issuanceOfStock;
  criteria.push(
    pass(
      "noNewShares",
      "Keine neuen Aktien emittiert",
      issued != null ? issued <= 0 : null
    )
  );

  // Operating Efficiency (2)
  const gm0 =
    y0.grossProfit != null && y0.totalRevenue
      ? y0.grossProfit / y0.totalRevenue
      : null;
  const gm1 =
    y1.grossProfit != null && y1.totalRevenue
      ? y1.grossProfit / y1.totalRevenue
      : null;
  criteria.push(
    pass(
      "grossMarginUp",
      "Bruttomarge gestiegen",
      gm0 != null && gm1 != null ? gm0 > gm1 : null,
      gm0 != null ? (gm0 * 100).toFixed(1) + "%" : undefined
    )
  );
  const atr0 =
    y0.totalRevenue != null && y0.totalAssets
      ? y0.totalRevenue / y0.totalAssets
      : null;
  const atr1 =
    y1.totalRevenue != null && y1.totalAssets
      ? y1.totalRevenue / y1.totalAssets
      : null;
  criteria.push(
    pass(
      "assetTurnoverUp",
      "Asset-Turnover gestiegen",
      atr0 != null && atr1 != null ? atr0 > atr1 : null,
      atr0 != null ? atr0.toFixed(2) : undefined
    )
  );

  const score = criteria.filter((c) => c.passed === true).length;
  return {
    score,
    maxScore: 9,
    criteria,
    label: labelFromScore(score),
    applicable: true,
  };
}

// ============================================================
// Altman Z-Score (klassische Manufacturing-Formel)
// ============================================================

export interface AltmanResult {
  z: number | null;
  components: {
    workingCapitalToAssets: number | null;
    retainedEarningsToAssets: number | null;
    ebitToAssets: number | null;
    marketEquityToLiabilities: number | null;
    salesToAssets: number | null;
  };
  zone: "safe" | "grey" | "distress" | "n/a";
  interpretation: string;
}

export function computeAltman(
  annual: FinancialRow[],
  marketCap: number | null | undefined
): AltmanResult {
  const base: AltmanResult = {
    z: null,
    components: {
      workingCapitalToAssets: null,
      retainedEarningsToAssets: null,
      ebitToAssets: null,
      marketEquityToLiabilities: null,
      salesToAssets: null,
    },
    zone: "n/a",
    interpretation: "Zu wenig Bilanzdaten für Altman-Z",
  };
  if (annual.length === 0) return base;
  const y = annual[0];
  const ta = y.totalAssets;
  if (!ta || ta <= 0) return base;
  const wc =
    y.totalCurrentAssets != null && y.totalCurrentLiabilities != null
      ? y.totalCurrentAssets - y.totalCurrentLiabilities
      : null;
  const A = wc != null ? wc / ta : null;
  const B = y.retainedEarnings != null ? y.retainedEarnings / ta : null;
  const C = y.ebit != null ? y.ebit / ta : null;
  const D =
    marketCap != null && y.totalLiab != null && y.totalLiab > 0
      ? marketCap / y.totalLiab
      : null;
  const E = y.totalRevenue != null ? y.totalRevenue / ta : null;

  if (A == null || B == null || C == null || D == null || E == null) {
    return {
      ...base,
      components: {
        workingCapitalToAssets: A,
        retainedEarningsToAssets: B,
        ebitToAssets: C,
        marketEquityToLiabilities: D,
        salesToAssets: E,
      },
      interpretation: "Unvollständige Bilanzdaten für Altman-Z",
    };
  }

  const z = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
  let zone: "safe" | "grey" | "distress" = "distress";
  let interpretation = "";
  if (z > 2.99) {
    zone = "safe";
    interpretation = "Safe Zone — geringes Insolvenzrisiko laut Altman";
  } else if (z >= 1.81) {
    zone = "grey";
    interpretation = "Grey Zone — erhöhte Wachsamkeit empfohlen";
  } else {
    zone = "distress";
    interpretation = "Distress Zone — erhöhtes Insolvenzrisiko laut Altman";
  }
  return {
    z,
    components: {
      workingCapitalToAssets: A,
      retainedEarningsToAssets: B,
      ebitToAssets: C,
      marketEquityToLiabilities: D,
      salesToAssets: E,
    },
    zone,
    interpretation,
  };
}

// ============================================================
// Beneish M-Score (Verdacht auf Bilanzmanipulation)
// ============================================================

export interface BeneishResult {
  m: number | null;
  components: Record<string, number | null>;
  label: "likely manipulator" | "unlikely manipulator" | "n/a";
  interpretation: string;
}

export function computeBeneish(annual: FinancialRow[]): BeneishResult {
  const empty: BeneishResult = {
    m: null,
    components: {},
    label: "n/a",
    interpretation: "Nicht genug Bilanzdaten für Beneish",
  };
  if (annual.length < 2) return empty;
  const y = annual[0];
  const yp = annual[1];

  const req = (n: number | null | undefined, fallback = 0): number =>
    typeof n === "number" && Number.isFinite(n) ? n : fallback;

  const sales = y.totalRevenue,
    salesPrev = yp.totalRevenue;
  const receivables = y.receivables,
    receivablesPrev = yp.receivables;
  if (!sales || !salesPrev || !receivables || !receivablesPrev) return empty;

  const DSRI =
    (receivables / sales) / (receivablesPrev / salesPrev);
  const GMI =
    ((salesPrev - req(yp.costOfRevenue)) / salesPrev) /
    ((sales - req(y.costOfRevenue)) / sales);
  const curAssetsPlusPpe = req(y.totalCurrentAssets) + req(y.netPpe);
  const curAssetsPlusPpePrev = req(yp.totalCurrentAssets) + req(yp.netPpe);
  const AQI =
    y.totalAssets && yp.totalAssets
      ? (1 - curAssetsPlusPpe / y.totalAssets) /
        (1 - curAssetsPlusPpePrev / yp.totalAssets)
      : 1;
  const SGI = sales / salesPrev;
  const DEPI =
    req(yp.depreciation) > 0 && req(y.depreciation) > 0
      ? (req(yp.depreciation) / (req(yp.depreciation) + req(yp.netPpe))) /
        (req(y.depreciation) / (req(y.depreciation) + req(y.netPpe)))
      : 1;
  const SGAI =
    (req(y.sga) / sales) / (req(yp.sga) / salesPrev || 1);
  const LVGI =
    y.totalAssets && yp.totalAssets
      ? (req(y.totalLiab) / y.totalAssets) /
        (req(yp.totalLiab) / yp.totalAssets)
      : 1;
  const TATA =
    y.totalAssets
      ? (req(y.netIncome) - req(y.operatingCashflow)) / y.totalAssets
      : 0;

  const m =
    -4.84 +
    0.92 * DSRI +
    0.528 * GMI +
    0.404 * AQI +
    0.892 * SGI +
    0.115 * DEPI -
    0.172 * SGAI +
    4.679 * TATA -
    0.327 * LVGI;

  const label: BeneishResult["label"] =
    m > -1.78 ? "likely manipulator" : "unlikely manipulator";
  const interpretation =
    m > -1.78
      ? "M > −1.78 — Verdacht auf earnings manipulation laut Beneish-Modell"
      : "M ≤ −1.78 — unauffällig laut Beneish-Modell";

  return {
    m,
    components: { DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA },
    label,
    interpretation,
  };
}

// ============================================================
// Graham Number + Shareholder Yield
// ============================================================

export interface GrahamResult {
  grahamNumber: number | null;
  currentPrice: number | null;
  upsideDownsidePct: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  interpretation: string;
}

export function computeGrahamNumber(
  eps: number | null | undefined,
  bookValuePerShare: number | null | undefined,
  currentPrice: number | null | undefined
): GrahamResult {
  const base: GrahamResult = {
    grahamNumber: null,
    currentPrice: currentPrice ?? null,
    upsideDownsidePct: null,
    eps: eps ?? null,
    bookValuePerShare: bookValuePerShare ?? null,
    interpretation: "EPS oder Book-Value fehlt",
  };
  if (eps == null || bookValuePerShare == null) return base;
  if (eps <= 0 || bookValuePerShare <= 0) {
    return {
      ...base,
      interpretation:
        "Graham Number erfordert positiven EPS und Buchwert — nicht berechenbar",
    };
  }
  const graham = Math.sqrt(22.5 * eps * bookValuePerShare);
  const upside =
    currentPrice != null && currentPrice > 0
      ? ((graham - currentPrice) / currentPrice) * 100
      : null;
  const interpretation =
    upside == null
      ? "Graham Number berechnet; Kurs fehlt für Vergleich"
      : upside > 0
        ? `${upside.toFixed(1)}% unter Graham-Fair-Value — potenzieller Value-Kandidat`
        : `${Math.abs(upside).toFixed(1)}% über Graham-Fair-Value — aus Value-Sicht teuer`;
  return {
    grahamNumber: graham,
    currentPrice: currentPrice ?? null,
    upsideDownsidePct: upside,
    eps,
    bookValuePerShare,
    interpretation,
  };
}

export interface ShareholderYieldResult {
  dividendYieldPct: number | null;
  buybackYieldPct: number | null;
  debtPaydownYieldPct: number | null;
  totalShareholderYieldPct: number | null;
  interpretation: string;
}

export function computeShareholderYield(
  annual: FinancialRow[],
  marketCap: number | null | undefined,
  dividendYield: number | null | undefined
): ShareholderYieldResult {
  const base: ShareholderYieldResult = {
    dividendYieldPct: dividendYield != null ? dividendYield * 100 : null,
    buybackYieldPct: null,
    debtPaydownYieldPct: null,
    totalShareholderYieldPct: null,
    interpretation: "Market-Cap oder Cashflow-Daten fehlen",
  };
  if (annual.length === 0 || !marketCap || marketCap <= 0) return base;
  const y = annual[0];
  const buybackNet =
    y.repurchaseOfStock != null || y.issuanceOfStock != null
      ? Math.abs(y.repurchaseOfStock ?? 0) - Math.abs(y.issuanceOfStock ?? 0)
      : null;
  const buybackYield =
    buybackNet != null ? (buybackNet / marketCap) * 100 : null;
  const debtPaydownYield =
    y.netIssuanceOfDebt != null
      ? (-y.netIssuanceOfDebt / marketCap) * 100
      : null;
  const div = dividendYield != null ? dividendYield * 100 : 0;
  const total =
    (div || 0) + (buybackYield || 0) + (debtPaydownYield || 0);
  const interpretation =
    total > 0
      ? `Gesamt-Shareholder-Yield ≈ ${total.toFixed(2)}%`
      : "Gesamt-Yield negativ — Verwässerung oder Netto-Neuverschuldung";
  return {
    dividendYieldPct: div || null,
    buybackYieldPct: buybackYield,
    debtPaydownYieldPct: debtPaydownYield,
    totalShareholderYieldPct: total,
    interpretation,
  };
}
