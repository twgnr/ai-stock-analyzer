import crypto from "crypto";

export type BrokerKey =
  | "comdirect"
  | "tradeRepublic"
  | "ibkr"
  | "ing"
  | "dkb"
  | "consorsbank"
  | "scalable"
  | "flatex"
  | "smartbroker"
  | "sbroker"
  | "generic";

export interface ParsedTx {
  ticker: string;
  type: "buy" | "sell" | "dividend" | "fee";
  shares: number;
  price: number;
  currency: string;
  fees: number;
  date: string; // YYYY-MM-DD
  amount?: number;
  notes?: string;
  externalRef: string;
  source: string;
}

export interface ParseResult {
  rows: ParsedTx[];
  warnings: string[];
  rawRowCount: number;
  skippedRows: number;
}

function parseEuNumber(s: string): number {
  if (!s) return 0;
  const t = s.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function parseUsNumber(s: string): number {
  if (!s) return 0;
  const t = s.trim().replace(/\s/g, "").replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function parseDateDE(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseDateISO(s: string): string | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseDate(s: string): string | null {
  return parseDateDE(s) || parseDateISO(s);
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const cnt = (line.match(new RegExp(`\\${c}`, "g")) || []).length;
    if (cnt > bestCount) {
      bestCount = cnt;
      best = c;
    }
  }
  return best;
}

function splitCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c === "\r") {
        // ignore
      } else {
        cur += c;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function makeRef(
  broker: BrokerKey,
  date: string,
  ticker: string,
  type: string,
  shares: number,
  price: number
): string {
  const h = crypto
    .createHash("sha1")
    .update(`${broker}|${date}|${ticker}|${type}|${shares}|${price}`)
    .digest("hex");
  return `${broker}:${h.slice(0, 16)}`;
}

// ---------------- comdirect ----------------
// Erwartet Semikolon-getrenntes CSV-Export aus Umsatzauskunft.
// Spalten variieren je nach Export-Variante; wir suchen per Header-Match.
function parseComdirect(text: string): ParseResult {
  const firstLine = text.split("\n")[0] || "";
  const delim = firstLine.includes(";") ? ";" : detectDelimiter(firstLine);
  const rowsRaw = splitCSV(text, delim);
  const warnings: string[] = [];
  const out: ParsedTx[] = [];
  if (rowsRaw.length === 0) return { rows: [], warnings: ["CSV leer"], rawRowCount: 0, skippedRows: 0 };

  // Header-Zeile finden (suche Zeile mit "Geschäftstag" oder "Buchungstag")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rowsRaw.length); i++) {
    const joined = rowsRaw[i].join("|").toLowerCase();
    if (joined.includes("geschäftstag") || joined.includes("buchungstag")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      rows: [],
      warnings: ["comdirect: Header-Zeile nicht gefunden (erwarte 'Geschäftstag' oder 'Buchungstag')"],
      rawRowCount: rowsRaw.length,
      skippedRows: rowsRaw.length,
    };
  }

  const header = rowsRaw[headerIdx].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.includes(name.toLowerCase()));
  const iDate = col("geschäftstag") >= 0 ? col("geschäftstag") : col("buchungstag");
  const iName = col("bezeichnung");
  const iWkn = col("wkn");
  const iIsin = col("isin");
  const iShares = col("stück");
  const iPrice = col("ausführungskurs");
  const iAmount = col("kurswert");
  const iCurrency = col("währung");
  const iFees = col("provision");
  const iAction = header.findIndex(
    (h) => h.includes("kaufen") || h.includes("verkaufen") || h === "umsatzart" || h === "typ"
  );

  let skipped = 0;
  for (let i = headerIdx + 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    const rawDate = iDate >= 0 ? r[iDate] || "" : "";
    const date = parseDate(rawDate);
    if (!date) {
      skipped++;
      continue;
    }
    const name = iName >= 0 ? (r[iName] || "").trim() : "";
    const wkn = iWkn >= 0 ? (r[iWkn] || "").trim() : "";
    const isin = iIsin >= 0 ? (r[iIsin] || "").trim() : "";
    const ticker = isin || wkn || name.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
    if (!ticker) {
      skipped++;
      continue;
    }
    const action = iAction >= 0 ? (r[iAction] || "").toLowerCase() : "";
    const isSell = action.includes("verkauf");
    const isDividend = action.includes("dividende") || action.includes("ertrag");
    const type: ParsedTx["type"] = isDividend ? "dividend" : isSell ? "sell" : "buy";
    const shares = iShares >= 0 ? Math.abs(parseEuNumber(r[iShares] || "")) : 0;
    const price = iPrice >= 0 ? parseEuNumber(r[iPrice] || "") : 0;
    const amount = iAmount >= 0 ? Math.abs(parseEuNumber(r[iAmount] || "")) : 0;
    const currency = (iCurrency >= 0 ? r[iCurrency] || "EUR" : "EUR").toUpperCase().trim();
    const fees = iFees >= 0 ? Math.abs(parseEuNumber(r[iFees] || "")) : 0;

    if (type !== "dividend" && (shares === 0 || price === 0)) {
      skipped++;
      warnings.push(`Zeile ${i + 1}: Stück oder Kurs fehlt — übersprungen`);
      continue;
    }

    out.push({
      ticker: ticker.toUpperCase(),
      type,
      shares,
      price,
      currency,
      fees,
      amount: type === "dividend" ? amount : undefined,
      date,
      notes: name,
      externalRef: makeRef("comdirect", date, ticker, type, shares, price),
      source: "comdirect",
    });
  }
  return { rows: out, warnings, rawRowCount: rowsRaw.length - headerIdx - 1, skippedRows: skipped };
}

// ---------------- Trade Republic ----------------
// Trade-Republic-CSV-Struktur variiert; wir versuchen die gängige.
function parseTradeRepublic(text: string): ParseResult {
  const firstLine = text.split("\n")[0] || "";
  const delim = detectDelimiter(firstLine);
  const rows = splitCSV(text, delim);
  const warnings: string[] = [];
  const out: ParsedTx[] = [];
  if (rows.length === 0) return { rows: [], warnings: ["CSV leer"], rawRowCount: 0, skippedRows: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = col("date", "datum", "geschäftstag");
  const iType = col("type", "typ", "art");
  const iTicker = col("ticker", "isin", "wkn");
  const iName = col("name", "title", "bezeichnung", "instrument");
  const iShares = col("shares", "stück", "quantity");
  const iPrice = col("price", "kurs", "ausführungskurs");
  const iAmount = col("amount", "wert", "total");
  const iFees = col("fees", "gebühr", "provision");
  const iCurrency = col("currency", "währung");

  if (iDate < 0) {
    return {
      rows: [],
      warnings: ["Trade Republic: Kein Datums-Spalte gefunden"],
      rawRowCount: rows.length - 1,
      skippedRows: rows.length - 1,
    };
  }

  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[iDate] || "");
    if (!date) {
      skipped++;
      continue;
    }
    const tickerRaw = (iTicker >= 0 ? r[iTicker] : "").toUpperCase().trim();
    const name = iName >= 0 ? r[iName] || "" : "";
    const ticker = tickerRaw || name.toUpperCase().replace(/\s+/g, "_").slice(0, 20);
    if (!ticker) {
      skipped++;
      continue;
    }
    const typeRaw = (iType >= 0 ? r[iType] || "" : "").toLowerCase();
    const isSell = typeRaw.includes("sell") || typeRaw.includes("verkauf");
    const isDiv = typeRaw.includes("div") || typeRaw.includes("ertrag");
    const type: ParsedTx["type"] = isDiv ? "dividend" : isSell ? "sell" : "buy";
    const shares = iShares >= 0 ? Math.abs(parseEuNumber(r[iShares] || "")) : 0;
    const price = iPrice >= 0 ? parseEuNumber(r[iPrice] || "") : 0;
    const amount = iAmount >= 0 ? Math.abs(parseEuNumber(r[iAmount] || "")) : 0;
    const currency = (iCurrency >= 0 ? r[iCurrency] || "EUR" : "EUR").toUpperCase().trim();
    const fees = iFees >= 0 ? Math.abs(parseEuNumber(r[iFees] || "")) : 0;

    if (type !== "dividend" && (shares === 0 || price === 0)) {
      skipped++;
      warnings.push(`Zeile ${i + 1}: Stück oder Kurs fehlt — übersprungen`);
      continue;
    }

    out.push({
      ticker,
      type,
      shares,
      price,
      currency,
      fees,
      amount: type === "dividend" ? amount : undefined,
      date,
      notes: name || undefined,
      externalRef: makeRef("tradeRepublic", date, ticker, type, shares, price),
      source: "tradeRepublic",
    });
  }
  return { rows: out, warnings, rawRowCount: rows.length - 1, skippedRows: skipped };
}

// ---------------- IBKR Flex Query ----------------
// Trades-Section aus Activity Statement / Flex Query CSV
function parseIbkr(text: string): ParseResult {
  const firstLine = text.split("\n")[0] || "";
  const delim = firstLine.includes(",") ? "," : detectDelimiter(firstLine);
  const rows = splitCSV(text, delim);
  const warnings: string[] = [];
  const out: ParsedTx[] = [];
  if (rows.length === 0) return { rows: [], warnings: ["CSV leer"], rawRowCount: 0, skippedRows: 0 };

  // IBKR Flex Query: Header steht in Zeile 0 oder der ersten "Trades"-Section.
  // Einfache Variante: nimm die erste Zeile mit "Symbol" als Header.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const low = rows[i].map((c) => c.toLowerCase());
    if (low.includes("symbol") && (low.includes("quantity") || low.includes("qty"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      rows: [],
      warnings: ["IBKR: Keine Trades-Tabelle erkannt (erwarte 'Symbol'+'Quantity')"],
      rawRowCount: rows.length,
      skippedRows: rows.length,
    };
  }

  const header = rows[headerIdx].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name.toLowerCase());
  const iSymbol = col("symbol");
  const iQty = col("quantity") >= 0 ? col("quantity") : col("qty");
  const iPrice = col("tradeprice") >= 0 ? col("tradeprice") : col("price");
  const iDate = col("tradedate") >= 0 ? col("tradedate") : col("date");
  const iCurrency = col("currency");
  const iFees = col("commission");
  const iBuyOrSell = col("buy/sell");

  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length / 2) continue;
    const symbol = (iSymbol >= 0 ? r[iSymbol] || "" : "").toUpperCase().trim();
    if (!symbol) {
      skipped++;
      continue;
    }
    const qtyRaw = iQty >= 0 ? r[iQty] || "" : "";
    const qty = parseUsNumber(qtyRaw);
    if (qty === 0) {
      skipped++;
      continue;
    }
    const priceRaw = iPrice >= 0 ? r[iPrice] || "" : "";
    const price = parseUsNumber(priceRaw);
    // IBKR-Datum oft YYYY-MM-DD oder YYYYMMDD
    let date: string | null = null;
    const rawDate = iDate >= 0 ? r[iDate] || "" : "";
    const mIso = rawDate.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (mIso) date = `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
    else date = parseDate(rawDate);
    if (!date) {
      skipped++;
      continue;
    }
    const currency = (iCurrency >= 0 ? r[iCurrency] || "USD" : "USD").toUpperCase().trim();
    const fees = iFees >= 0 ? Math.abs(parseUsNumber(r[iFees] || "")) : 0;
    const action = (iBuyOrSell >= 0 ? r[iBuyOrSell] || "" : "").toUpperCase();
    const isSell = qty < 0 || action === "SELL";
    const type: ParsedTx["type"] = isSell ? "sell" : "buy";
    const shares = Math.abs(qty);

    out.push({
      ticker: symbol,
      type,
      shares,
      price,
      currency,
      fees,
      date,
      externalRef: makeRef("ibkr", date, symbol, type, shares, price),
      source: "ibkr",
    });
  }
  return { rows: out, warnings, rawRowCount: rows.length - headerIdx - 1, skippedRows: skipped };
}

// ---------------- Generic (spaltenbasiert mit Standard-Header) ----------------
// Erwartet Spalten: date, ticker, type (buy/sell/dividend), shares, price, currency, fees
function parseGeneric(text: string): ParseResult {
  const firstLine = text.split("\n")[0] || "";
  const delim = detectDelimiter(firstLine);
  const rows = splitCSV(text, delim);
  const warnings: string[] = [];
  const out: ParsedTx[] = [];
  if (rows.length < 2) {
    return { rows: [], warnings: ["CSV leer oder ohne Datensätze"], rawRowCount: 0, skippedRows: 0 };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const required = ["date", "ticker", "type", "shares", "price"];
  for (const r of required) {
    if (!header.includes(r)) {
      return {
        rows: [],
        warnings: [
          `Generic-Import erfordert Spalten: ${required.join(", ")} (fehlt: ${r}). Optional: currency, fees, notes`,
        ],
        rawRowCount: rows.length - 1,
        skippedRows: rows.length - 1,
      };
    }
  }
  const idx = (n: string) => header.indexOf(n);

  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[idx("date")] || "");
    const ticker = (r[idx("ticker")] || "").toUpperCase().trim();
    const typeRaw = (r[idx("type")] || "").toLowerCase().trim();
    const shares = parseEuNumber(r[idx("shares")] || "");
    const price = parseEuNumber(r[idx("price")] || "");
    const currency =
      idx("currency") >= 0 ? (r[idx("currency")] || "EUR").toUpperCase() : "EUR";
    const fees = idx("fees") >= 0 ? Math.abs(parseEuNumber(r[idx("fees")] || "")) : 0;
    const notes = idx("notes") >= 0 ? r[idx("notes")] : undefined;
    if (!date || !ticker || !["buy", "sell", "dividend", "fee"].includes(typeRaw)) {
      skipped++;
      continue;
    }
    const type = typeRaw as ParsedTx["type"];
    out.push({
      ticker,
      type,
      shares: Math.abs(shares),
      price,
      currency,
      fees,
      date,
      notes: notes || undefined,
      externalRef: makeRef("generic", date, ticker, type, shares, price),
      source: "generic",
    });
  }
  return { rows: out, warnings, rawRowCount: rows.length - 1, skippedRows: skipped };
}

// ---------------- Flexibler Header-Parser für DE-Broker ----------------
// Funktioniert für ING, DKB, Consorsbank, Scalable Capital, flatex,
// Smartbroker, S Broker und ähnliche, die alle Header-basierte CSVs liefern
// — die Spaltennamen variieren nur leicht und werden via Aliase gematcht.
function parseFlexibleHeaderCSV(
  text: string,
  brokerKey: BrokerKey,
  source: string
): ParseResult {
  const firstLine = text.split("\n")[0] || "";
  const delim = firstLine.includes(";")
    ? ";"
    : firstLine.includes("\t")
      ? "\t"
      : detectDelimiter(firstLine);
  const rowsRaw = splitCSV(text, delim);
  const warnings: string[] = [];
  const out: ParsedTx[] = [];
  if (rowsRaw.length === 0)
    return { rows: [], warnings: ["CSV leer"], rawRowCount: 0, skippedRows: 0 };

  // Header-Zeile finden — viele Broker haben Vorspann-Zeilen mit Konto-Infos.
  // Wir suchen die erste Zeile, die typische Transaktions-Header enthält.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, rowsRaw.length); i++) {
    const joined = rowsRaw[i].join("|").toLowerCase();
    const hasDate =
      joined.includes("datum") ||
      joined.includes("date") ||
      joined.includes("geschäftstag") ||
      joined.includes("buchungstag") ||
      joined.includes("valuta");
    const hasInstrument =
      joined.includes("isin") ||
      joined.includes("wkn") ||
      joined.includes("symbol") ||
      joined.includes("ticker") ||
      joined.includes("bezeichnung") ||
      joined.includes("name") ||
      joined.includes("instrument") ||
      joined.includes("wertpapier");
    const hasShares =
      joined.includes("stück") ||
      joined.includes("nominal") ||
      joined.includes("anzahl") ||
      joined.includes("quantity") ||
      joined.includes("shares");
    if (hasDate && hasInstrument && hasShares) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      rows: [],
      warnings: [
        `${source}: Header-Zeile nicht gefunden (erwartet: Datum + ISIN/WKN/Symbol + Stück/Nominal). Eventuell hat dein Export ein anderes Format — versuch dann den Generic-Import oder editiere die Datei.`,
      ],
      rawRowCount: rowsRaw.length,
      skippedRows: rowsRaw.length,
    };
  }

  const header = rowsRaw[headerIdx].map((h) => h.trim().toLowerCase());
  const findCol = (...needles: string[]): number =>
    header.findIndex((h) =>
      needles.some((n) => h.includes(n.toLowerCase()))
    );

  const iDate = findCol(
    "geschäftstag",
    "buchungstag",
    "ausführungstag",
    "datum",
    "date",
    "valuta",
    "trade date"
  );
  const iIsin = findCol("isin");
  const iWkn = findCol("wkn");
  const iSymbol = findCol("symbol", "ticker");
  const iName = findCol("bezeichnung", "wertpapier", "instrument", "name", "title");
  const iShares = findCol("stück", "nominal", "anzahl", "quantity", "shares", "qty");
  const iPrice = findCol(
    "ausführungskurs",
    "ausführungspreis",
    "kurs",
    "preis",
    "price",
    "tradeprice"
  );
  const iAmount = findCol("kurswert", "betrag", "amount", "wert", "total", "umsatz");
  const iCurrency = findCol("währung", "currency", "whrg");
  const iFees = findCol(
    "provision",
    "gebühr",
    "gebuehr",
    "fees",
    "commission",
    "kosten"
  );
  const iAction = findCol(
    "umsatzart",
    "art",
    "typ",
    "type",
    "buy/sell",
    "buy_sell",
    "transaktionsart",
    "geschäftsart",
    "operation"
  );

  if (iDate < 0) {
    return {
      rows: [],
      warnings: [`${source}: Keine Datums-Spalte erkannt`],
      rawRowCount: rowsRaw.length - headerIdx - 1,
      skippedRows: rowsRaw.length - headerIdx - 1,
    };
  }

  let skipped = 0;
  for (let i = headerIdx + 1; i < rowsRaw.length; i++) {
    const r = rowsRaw[i];
    if (r.length < 3) continue;
    const rawDate = r[iDate] || "";
    const date = parseDate(rawDate);
    if (!date) {
      skipped++;
      continue;
    }
    const isin = iIsin >= 0 ? (r[iIsin] || "").trim() : "";
    const wkn = iWkn >= 0 ? (r[iWkn] || "").trim() : "";
    const symbol = iSymbol >= 0 ? (r[iSymbol] || "").trim() : "";
    const name = iName >= 0 ? (r[iName] || "").trim() : "";
    const ticker =
      symbol ||
      isin ||
      wkn ||
      (name ? name.toUpperCase().replace(/\s+/g, "_").slice(0, 20) : "");
    if (!ticker) {
      skipped++;
      continue;
    }
    const action = (iAction >= 0 ? r[iAction] || "" : "").toLowerCase().trim();
    const isSell =
      action.includes("verkauf") ||
      action.includes("sell") ||
      action === "v" ||
      action === "s";
    const isDividend =
      action.includes("dividende") ||
      action.includes("ertrag") ||
      action.includes("div") ||
      action.includes("ausschüttung");
    const isFee =
      action.includes("gebühr") ||
      action.includes("entgelt") ||
      action === "fee";
    const type: ParsedTx["type"] = isFee
      ? "fee"
      : isDividend
        ? "dividend"
        : isSell
          ? "sell"
          : "buy";

    // Heuristik: mit Komma als Decimal (DE) parsen, sonst US.
    // Wenn das Feld einen Punkt UND ein Komma hat, ist es DE-Format.
    const sharesRaw = iShares >= 0 ? r[iShares] || "" : "";
    const priceRaw = iPrice >= 0 ? r[iPrice] || "" : "";
    const amountRaw = iAmount >= 0 ? r[iAmount] || "" : "";
    const feesRaw = iFees >= 0 ? r[iFees] || "" : "";
    const isDeNumber = (s: string) =>
      s.includes(",") && (s.lastIndexOf(",") > s.lastIndexOf(".") || !s.includes("."));
    const num = (s: string) => (isDeNumber(s) ? parseEuNumber(s) : parseUsNumber(s));

    const shares = Math.abs(num(sharesRaw));
    const price = num(priceRaw);
    const amount = Math.abs(num(amountRaw));
    const fees = Math.abs(num(feesRaw));
    const currency = (iCurrency >= 0 ? r[iCurrency] || "EUR" : "EUR")
      .toUpperCase()
      .trim();

    if (type !== "dividend" && type !== "fee" && (shares === 0 || price === 0)) {
      skipped++;
      continue;
    }

    out.push({
      ticker: ticker.toUpperCase(),
      type,
      shares,
      price,
      currency: currency || "EUR",
      fees,
      amount: type === "dividend" ? amount : undefined,
      date,
      notes: name || undefined,
      externalRef: makeRef(brokerKey, date, ticker, type, shares, price),
      source,
    });
  }
  return {
    rows: out,
    warnings,
    rawRowCount: rowsRaw.length - headerIdx - 1,
    skippedRows: skipped,
  };
}

export function parseBrokerCSV(broker: BrokerKey, text: string): ParseResult {
  switch (broker) {
    case "comdirect":
      return parseComdirect(text);
    case "tradeRepublic":
      return parseTradeRepublic(text);
    case "ibkr":
      return parseIbkr(text);
    case "ing":
      return parseFlexibleHeaderCSV(text, "ing", "ing");
    case "dkb":
      return parseFlexibleHeaderCSV(text, "dkb", "dkb");
    case "consorsbank":
      return parseFlexibleHeaderCSV(text, "consorsbank", "consorsbank");
    case "scalable":
      return parseFlexibleHeaderCSV(text, "scalable", "scalable");
    case "flatex":
      return parseFlexibleHeaderCSV(text, "flatex", "flatex");
    case "smartbroker":
      return parseFlexibleHeaderCSV(text, "smartbroker", "smartbroker");
    case "sbroker":
      return parseFlexibleHeaderCSV(text, "sbroker", "sbroker");
    case "generic":
    default:
      return parseGeneric(text);
  }
}

export const BROKERS: Array<{
  key: BrokerKey;
  label: string;
  hint: string;
}> = [
  {
    key: "comdirect",
    label: "comdirect",
    hint: "Umsatz-Export mit Spalten Geschäftstag, WKN/ISIN, Stück, Ausführungskurs, Kurswert, Provision",
  },
  {
    key: "tradeRepublic",
    label: "Trade Republic",
    hint: "CSV mit date, type (buy/sell/div), ISIN oder name, shares, price, fees, currency",
  },
  {
    key: "ibkr",
    label: "Interactive Brokers",
    hint: "Flex-Query-Export der Trades-Section (Symbol, Quantity, TradePrice, TradeDate, Currency, Commission, Buy/Sell)",
  },
  {
    key: "ing",
    label: "ING (DiBa)",
    hint: "Umsatz-/Wertpapier-Export mit Datum, ISIN/WKN, Stück, Kurs, Betrag, Provision. Im Banking unter Wertpapiere → Umsätze → Export.",
  },
  {
    key: "dkb",
    label: "DKB",
    hint: "Depot-Umsätze-Export mit Datum, ISIN, Stück, Kurs, Provision. Im Banking unter Depot → Umsätze → CSV.",
  },
  {
    key: "consorsbank",
    label: "Consorsbank",
    hint: "Wertpapier-Umsätze als CSV (Geschäftstag, ISIN/WKN, Stück, Ausführungskurs, Kurswert, Provision).",
  },
  {
    key: "scalable",
    label: "Scalable Capital",
    hint: "Transaktions-Export aus dem Scalable-Webclient (date, type, ISIN, shares, price, fees, currency).",
  },
  {
    key: "flatex",
    label: "flatex / DEGIRO",
    hint: "Umsatzauskunft mit Datum, ISIN/WKN, Stück, Kurs, Provision. flatex und DEGIRO nutzen ein sehr ähnliches Format.",
  },
  {
    key: "smartbroker",
    label: "Smartbroker / Smartbroker+",
    hint: "Wertpapier-Umsätze (Smartbroker basiert auf DAB-/BNP-Strukturen — Datum, ISIN, Stück, Kurs, Provision).",
  },
  {
    key: "sbroker",
    label: "S Broker (Sparkasse)",
    hint: "Depot-Umsätze CSV der Sparkassen S Broker (Datum, ISIN/WKN, Stück, Kurs, Kurswert, Provision).",
  },
  {
    key: "generic",
    label: "Generic (eigenes CSV)",
    hint: "Header: date;ticker;type(buy|sell|dividend);shares;price;currency;fees;notes — DE-Zahlen (1.234,56) und Datum (DD.MM.YYYY oder YYYY-MM-DD)",
  },
];
