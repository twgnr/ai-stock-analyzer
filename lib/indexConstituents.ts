/**
 * Constituent-Listen der wichtigsten Indizes.
 *
 * Quellen: Deutsche Börse (DAX/MDAX/SDAX/TecDAX-Composition), S&P Global,
 * Nasdaq. Index-Zusammensetzungen werden regelmäßig angepasst — die Listen
 * hier sind ein repräsentativer Stand. Bei Bedarf manuell nachziehen.
 *
 * S&P 500: Wir führen die größten ~120 Mega-/Large-Caps. Top-/Flop-Mover
 * kommen fast immer aus diesem Pool; die ganzen 500 aufzunehmen würde den
 * Scan unnötig in die Länge ziehen.
 */

export type IndexKey =
  | "dax"
  | "mdax"
  | "sdax"
  | "tecdax"
  | "xetra"
  | "dow"
  | "sp500"
  | "nasdaq100";

export interface IndexMeta {
  key: IndexKey;
  label: string;
  region: "Deutschland" | "USA";
  constituents: string[];
}

const DAX: string[] = [
  "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE",
  "BNR.DE", "CBK.DE", "CON.DE", "1COV.DE", "DBK.DE", "DB1.DE", "DHL.DE",
  "DHER.DE", "DTE.DE", "DTG.DE", "ENR.DE", "EOAN.DE", "FRE.DE", "HNR1.DE",
  "HEI.DE", "HEN3.DE", "IFX.DE", "MBG.DE", "MRK.DE", "MTX.DE", "MUV2.DE",
  "P911.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE", "SRT3.DE",
  "SIE.DE", "SHL.DE", "SY1.DE", "VOW3.DE", "VNA.DE", "ZAL.DE",
];

const MDAX: string[] = [
  "AOX.DE", "AFX.DE", "AIXA.DE", "ARL.DE", "G1A.DE", "CEC.DE", "COK.DE",
  "DUE.DE", "DHL.DE", "ECV.DE", "EVK.DE", "EVD.DE", "FIE.DE", "FNTN.DE",
  "FRA.DE", "FPE3.DE", "GIL.DE", "GFT.DE", "GXI.DE", "HAB.DE", "HBH.DE",
  "HLE.DE", "HFG.DE", "HOT.DE", "JUN3.DE", "KGX.DE", "KRN.DE", "LXS.DE",
  "LEG.DE", "LEO.DE", "LHA.DE", "MTX.DE", "NDA.DE", "NEM.DE", "O2D.DE",
  "PBB.DE", "PSM.DE", "RAA.DE", "RHK.DE", "RRTL.DE", "SZG.DE", "SDF.DE",
  "SAX.DE", "SCMN.DE", "SOW.DE", "SZU.DE", "SYAB.DE", "TUI1.DE", "UN01.DE",
  "UTDI.DE",
];

const SDAX: string[] = [
  "1U1.DE", "AAD.DE", "ADJ.DE", "ADV.DE", "AG1.DE", "AGR.DE", "AT1.DE",
  "B5A.DE", "BC8.DE", "BDT.DE", "BYW6.DE", "CEV.DE", "COP.DE", "CWC.DE",
  "DEZ.DE", "DIC.DE", "DRW3.DE", "EUZ.DE", "EVT.DE", "FEV.DE", "FNTN.DE",
  "GWI1.DE", "HAB.DE", "HDD.DE", "HYQ.DE", "INH.DE", "KCO.DE", "KSB3.DE",
  "LPK.DE", "M5Z.DE", "MEO.DE", "NOEJ.DE", "O1BC.DE", "PFV.DE", "PSAN.DE",
  "PVA.DE", "S92.DE", "SGL.DE", "SIX2.DE", "SMHN.DE", "SYT.DE", "SZG.DE",
  "TTK.DE", "VAR1.DE", "VBK.DE", "VTWR.DE", "WAF.DE", "WAC.DE",
];

const TECDAX: string[] = [
  "1U1.DE", "AFX.DE", "AIXA.DE", "BC8.DE", "CAN.DE", "CEV.DE", "DHER.DE",
  "DTE.DE", "ECV.DE", "ELG.DE", "EVT.DE", "FNTN.DE", "HDD.DE", "IFX.DE",
  "JEN.DE", "JUN3.DE", "KGX.DE", "MOR.DE", "NDA.DE", "NEM.DE", "PFV.DE",
  "QIA.DE", "S92.DE", "SAP.DE", "SHL.DE", "SOW.DE", "UN01.DE", "UTDI.DE",
  "VAR1.DE", "WAF.DE",
];

const DOW: string[] = [
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

const NASDAQ100: string[] = [
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
  "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AXON", "AZN", "BIIB", "BKNG",
  "BKR", "CCEP", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD",
  "CSCO", "CSGP", "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA",
  "EXC", "FANG", "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON",
  "IDXX", "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU",
  "MAR", "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRNA", "MRVL", "MSFT",
  "MU", "NFLX", "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR",
  "PDD", "PEP", "PLTR", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX", "SNPS",
  "TEAM", "TMUS", "TSLA", "TTD", "TTWO", "TXN", "VRSK", "VRTX", "WBD", "WDAY",
  "XEL", "ZS",
];

// S&P 500 — Top 120 nach Marktkapitalisierung (repräsentativ für Top-/Flop-Mover).
// Liste kann leicht ergänzt werden; neue Ticker einfach unten anhängen.
const SP500_TOP: string[] = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "BRK-B", "TSLA",
  "LLY", "AVGO", "JPM", "V", "UNH", "XOM", "WMT", "MA", "JNJ", "PG", "COST",
  "HD", "ORCL", "NFLX", "ABBV", "BAC", "CVX", "KO", "PEP", "CRM", "MRK",
  "AMD", "TMO", "ACN", "ADBE", "LIN", "MCD", "CSCO", "QCOM", "WFC", "NOW",
  "ABT", "CAT", "DIS", "IBM", "GE", "INTU", "VZ", "AXP", "TXN", "NEE",
  "ISRG", "AMGN", "RTX", "T", "PM", "SPGI", "GS", "DHR", "PFE", "MS",
  "BKNG", "C", "UBER", "BLK", "CMCSA", "HON", "PGR", "LOW", "SYK", "LMT",
  "BSX", "TJX", "ETN", "COP", "PLD", "VRTX", "ADP", "MDT", "SCHW", "BX",
  "PANW", "CB", "REGN", "DE", "ADI", "FI", "BA", "MMC", "ELV", "CI",
  "MU", "GILD", "UPS", "SO", "ZTS", "APH", "DUK", "KKR", "LRCX", "SHW",
  "CL", "MO", "ICE", "BMY", "PNC", "CME", "TGT", "USB", "MCO", "WM",
  "EOG", "ITW", "AON", "EQIX", "NKE", "EMR", "CSX", "FDX", "TT", "NOC",
];

export const INDEX_META: Record<IndexKey, IndexMeta> = {
  dax: { key: "dax", label: "DAX 40", region: "Deutschland", constituents: DAX },
  mdax: {
    key: "mdax",
    label: "MDAX 50",
    region: "Deutschland",
    constituents: MDAX,
  },
  sdax: {
    key: "sdax",
    label: "SDAX",
    region: "Deutschland",
    constituents: SDAX,
  },
  tecdax: {
    key: "tecdax",
    label: "TecDAX 30",
    region: "Deutschland",
    constituents: TECDAX,
  },
  xetra: {
    key: "xetra",
    label: "XETRA (DAX+MDAX+SDAX+TecDAX)",
    region: "Deutschland",
    constituents: [...new Set([...DAX, ...MDAX, ...SDAX, ...TECDAX])],
  },
  dow: {
    key: "dow",
    label: "Dow Jones 30",
    region: "USA",
    constituents: DOW,
  },
  sp500: {
    key: "sp500",
    label: "S&P 500 (Top 120 nach MCap)",
    region: "USA",
    constituents: SP500_TOP,
  },
  nasdaq100: {
    key: "nasdaq100",
    label: "Nasdaq 100",
    region: "USA",
    constituents: NASDAQ100,
  },
};

export const SHARED_INDEX_KEYS: IndexKey[] = [
  "dax",
  "mdax",
  "sdax",
  "tecdax",
  "xetra",
  "dow",
  "sp500",
  "nasdaq100",
];
