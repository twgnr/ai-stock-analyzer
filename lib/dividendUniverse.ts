/**
 * Kuratiertes Start-Universum für den Dividenden-Screener.
 *
 * Yahoo hat keinen „alle Dividenden-Zahler"-Endpoint, also listen wir hier
 * bekannte Dividenden-Titel aus DACH, USA und internationalen Märkten
 * manuell auf. Benutzer können über das UI zusätzlich ihre eigenen
 * Portfolio- und Watchlist-Ticker einfließen lassen.
 *
 * Liste nicht vollständig, aber repräsentativ. Bei Bedarf erweitern.
 */

export const DIVIDEND_UNIVERSE: string[] = [
  // ── US Dividend Aristocrats (50+ Jahre steigende Dividenden) ──────────────
  "KO", // Coca-Cola
  "PG", // Procter & Gamble
  "JNJ", // Johnson & Johnson
  "PEP", // PepsiCo
  "CL", // Colgate-Palmolive
  "MMM", // 3M
  "ED", // Consolidated Edison
  "EMR", // Emerson Electric
  "CINF", // Cincinnati Financial
  "DOV", // Dover
  "GPC", // Genuine Parts
  "HRL", // Hormel Foods
  "LOW", // Lowe's
  "NUE", // Nucor
  "PNR", // Pentair
  "SPGI", // S&P Global
  "SWK", // Stanley Black & Decker
  "SYY", // Sysco
  "T", // AT&T
  "TGT", // Target
  "VFC", // VF Corp
  "WMT", // Walmart
  "AFL", // Aflac
  "APD", // Air Products
  "BDX", // Becton Dickinson
  "CAH", // Cardinal Health
  "CAT", // Caterpillar
  "CB", // Chubb
  "CVX", // Chevron
  "XOM", // Exxon Mobil
  "GWW", // Grainger
  "ITW", // Illinois Tool Works
  "MCD", // McDonald's
  "MDT", // Medtronic
  "MKC", // McCormick
  "PPG", // PPG Industries
  "ROP", // Roper Technologies
  "SHW", // Sherwin-Williams
  "TROW", // T. Rowe Price
  "ABBV", // AbbVie
  "ABT", // Abbott Labs
  "CVS", // CVS Health

  // ── Tech/Growth mit Dividende ─────────────────────────────────────────────
  "MSFT", // Microsoft
  "AAPL", // Apple
  "IBM", // IBM
  "CSCO", // Cisco
  "ORCL", // Oracle
  "TXN", // Texas Instruments
  "QCOM", // Qualcomm
  "INTC", // Intel
  "AVGO", // Broadcom

  // ── US-REITs (Income-fokussiert) ──────────────────────────────────────────
  "O", // Realty Income (monatlich!)
  "STAG", // STAG Industrial (monatlich)
  "MAIN", // Main Street Capital (monatlich)
  "VICI", // VICI Properties
  "WPC", // W. P. Carey
  "SPG", // Simon Property Group
  "PLD", // Prologis

  // ── Utilities ─────────────────────────────────────────────────────────────
  "DUK", // Duke Energy
  "SO", // Southern Company
  "NEE", // NextEra Energy
  "D", // Dominion Energy

  // ── Finanzen / Versicherer ────────────────────────────────────────────────
  "JPM", // JPMorgan Chase
  "BAC", // Bank of America
  "MS", // Morgan Stanley
  "BLK", // BlackRock
  "MET", // MetLife

  // ── DAX / Deutsche Blue-Chips ─────────────────────────────────────────────
  "ALV.DE", // Allianz
  "MUV2.DE", // Münchener Rück
  "BAS.DE", // BASF
  "BMW.DE", // BMW
  "MBG.DE", // Mercedes-Benz
  "DTE.DE", // Deutsche Telekom
  "SIE.DE", // Siemens
  "SAP.DE", // SAP
  "BAYN.DE", // Bayer
  "DHL.DE", // DHL Group
  "HEN3.DE", // Henkel
  "VOW3.DE", // Volkswagen
  "ENR.DE", // Siemens Energy
  "RWE.DE", // RWE
  "EOAN.DE", // E.ON

  // ── Schweiz ───────────────────────────────────────────────────────────────
  "NESN.SW", // Nestlé
  "ROG.SW", // Roche
  "NOVN.SW", // Novartis
  "ZURN.SW", // Zurich Insurance
  "UHR.SW", // Swatch

  // ── Niederlande / Frankreich / UK / Spanien ───────────────────────────────
  "ASML.AS", // ASML
  "UNA.AS", // Unilever
  "AD.AS", // Ahold Delhaize
  "MC.PA", // LVMH
  "OR.PA", // L'Oréal
  "AI.PA", // Air Liquide
  "SAN.PA", // Sanofi
  "BNP.PA", // BNP Paribas
  "ULVR.L", // Unilever (LSE)
  "AZN.L", // AstraZeneca
  "SHEL.L", // Shell
  "BP.L", // BP
  "HSBA.L", // HSBC
  "BATS.L", // British American Tobacco
  "ITX.MC", // Inditex (Zara)

  // ── Kanada (hohe Dividenden) ──────────────────────────────────────────────
  "ENB.TO", // Enbridge
  "BNS.TO", // Bank of Nova Scotia
  "TD.TO", // TD Bank

  // ── Skandinavien ──────────────────────────────────────────────────────────
  "NOVO-B.CO", // Novo Nordisk
  "EQNR.OL", // Equinor
  "VOLV-B.ST", // Volvo
];
