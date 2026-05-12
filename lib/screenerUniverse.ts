export type Region = "DE" | "EU" | "US" | "AS";

export interface UniverseEntry {
  ticker: string;
  region: Region;
}

const DAX40: UniverseEntry[] = [
  "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BMW.DE", "BNR.DE", "CBK.DE",
  "CON.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE", "DTG.DE", "ENR.DE", "EOAN.DE",
  "FME.DE", "FRE.DE", "HEI.DE", "HEN3.DE", "HFG.DE", "HNR1.DE", "IFX.DE", "MBG.DE",
  "MRK.DE", "MTX.DE", "MUV2.DE", "P911.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE",
  "SAP.DE", "SIE.DE", "SHL.DE", "SRT3.DE", "SY1.DE", "VOW3.DE", "VNA.DE", "ZAL.DE",
].map((t) => ({ ticker: t, region: "DE" as const }));

const MDAX_AND_GERMAN_MIDCAPS: UniverseEntry[] = [
  "AFX.DE", "AIXA.DE", "BOSS.DE", "EVK.DE", "EVT.DE", "FRA.DE", "G1A.DE", "GXI.DE",
  "HLAG.DE", "HOT.DE", "KGX.DE", "LEG.DE", "LHA.DE", "LXS.DE", "NDA.DE", "NEM.DE",
  "PBB.DE", "PSM.DE", "RAA.DE", "SDF.DE", "TKA.DE", "TLX.DE", "UTDI.DE", "WAF.DE",
  "SOW.DE", "DWNI.DE", "SZG.DE", "UN01.DE",
].map((t) => ({ ticker: t, region: "DE" as const }));

const EU_BLUE_CHIPS: UniverseEntry[] = [
  "ASML.AS", "PRX.AS", "INGA.AS", "UNA.AS", "AD.AS",
  "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "DGE.L", "RIO.L", "BATS.L",
  "LVMH.PA", "MC.PA", "OR.PA", "TTE.PA", "SAN.PA", "RMS.PA", "EL.PA", "SU.PA", "AIR.PA", "BN.PA",
  "NESN.SW", "NOVN.SW", "ROG.SW", "UBSG.SW", "ZURN.SW", "ABBN.SW",
  "SAN.MC", "IBE.MC", "BBVA.MC", "ITX.MC", "REP.MC",
  "ENI.MI", "ISP.MI", "UCG.MI", "RACE.MI", "STLAM.MI",
  "ABI.BR", "KBC.BR",
  "ATCO-A.ST", "VOLV-B.ST", "ERIC-B.ST", "INVE-B.ST",
  "NOVO-B.CO", "MAERSK-B.CO",
  "EQNR.OL", "DNB.OL",
  "ADYEN.AS", "HEIA.AS",
].map((t) => ({ ticker: t, region: "EU" as const }));

const US_MEGA_CAPS: UniverseEntry[] = [
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "BRK-B", "AVGO",
  "JPM", "V", "UNH", "XOM", "JNJ", "MA", "PG", "HD", "CVX", "LLY", "ABBV",
  "MRK", "PEP", "KO", "COST", "BAC", "WMT", "DIS", "ADBE", "NFLX", "CRM",
  "INTC", "AMD", "CSCO", "PFE", "TMO", "ORCL", "QCOM", "DHR", "VZ", "NKE",
  "TXN", "WFC", "MCD", "NEE", "PM", "UPS", "LIN", "HON", "BMY", "UNP",
  "LOW", "IBM", "AMGN", "BA", "SBUX", "GS", "MS", "CAT", "AXP", "BLK",
  "INTU", "NOW", "ISRG", "GE", "T", "SPGI", "DE", "AMAT", "PLD", "SYK",
].map((t) => ({ ticker: t, region: "US" as const }));

const US_GROWTH_TECH: UniverseEntry[] = [
  "PLTR", "SHOP", "SNOW", "CRWD", "DDOG", "NET", "MDB", "ZS", "PANW", "ANET",
  "UBER", "ABNB", "COIN", "SQ", "PYPL", "ROKU", "SPOT", "TEAM", "WDAY", "ZM",
].map((t) => ({ ticker: t, region: "US" as const }));

const ASIA: UniverseEntry[] = [
  "7203.T", "6758.T", "9984.T", "6861.T", "8306.T", "9432.T", "9433.T", "6098.T",
  "4063.T", "8035.T", "6367.T", "7974.T", "8058.T", "4661.T", "6902.T", "6273.T",
  "4519.T", "4502.T", "8316.T", "7267.T", "6501.T", "4543.T", "8031.T",
  "0700.HK", "9988.HK", "0941.HK", "0388.HK", "1299.HK", "1810.HK", "2318.HK",
  "0005.HK", "0883.HK", "1398.HK", "3690.HK", "1211.HK", "2382.HK", "2020.HK",
  "9618.HK", "2628.HK", "0066.HK",
  "2330.TW", "2317.TW", "2454.TW", "2412.TW", "2308.TW",
  "005930.KS", "000660.KS", "005380.KS", "051910.KS", "035420.KS", "035720.KS", "207940.KS",
  "D05.SI", "O39.SI", "U11.SI", "Z74.SI",
].map((t) => ({ ticker: t, region: "AS" as const }));

export const UNIVERSE: UniverseEntry[] = [
  ...DAX40,
  ...MDAX_AND_GERMAN_MIDCAPS,
  ...EU_BLUE_CHIPS,
  ...US_MEGA_CAPS,
  ...US_GROWTH_TECH,
  ...ASIA,
];

export function getUniverseByRegion(regions: Region[]): UniverseEntry[] {
  if (regions.length === 0) return UNIVERSE;
  const set = new Set(regions);
  return UNIVERSE.filter((u) => set.has(u.region));
}
