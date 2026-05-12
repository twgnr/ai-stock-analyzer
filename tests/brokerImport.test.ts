import { describe, it, expect } from "vitest";
import { parseBrokerCSV } from "@/lib/brokerImport";

describe("brokerImport / generic", () => {
  it("parses standard header with DE numbers", () => {
    const csv = `date;ticker;type;shares;price;currency;fees;notes
15.01.2026;AAPL;buy;10;185,50;USD;1,50;Notiz
20.02.2026;SAP.DE;sell;5;150,25;EUR;0,99;`;
    const r = parseBrokerCSV("generic", csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].ticker).toBe("AAPL");
    expect(r.rows[0].type).toBe("buy");
    expect(r.rows[0].shares).toBe(10);
    expect(r.rows[0].price).toBeCloseTo(185.5, 2);
    expect(r.rows[0].currency).toBe("USD");
    expect(r.rows[0].fees).toBeCloseTo(1.5, 2);
    expect(r.rows[0].date).toBe("2026-01-15");
    expect(r.rows[1].ticker).toBe("SAP.DE");
    expect(r.rows[1].type).toBe("sell");
  });

  it("rejects missing required columns", () => {
    const csv = `date;ticker;shares;price
15.01.2026;AAPL;10;100`;
    const r = parseBrokerCSV("generic", csv);
    expect(r.rows).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/type/);
  });

  it("produces stable externalRef per logical transaction", () => {
    const csv = `date;ticker;type;shares;price;currency;fees;notes
15.01.2026;AAPL;buy;10;100,00;USD;0;`;
    const r1 = parseBrokerCSV("generic", csv);
    const r2 = parseBrokerCSV("generic", csv);
    expect(r1.rows[0].externalRef).toBe(r2.rows[0].externalRef);
    expect(r1.rows[0].externalRef).toMatch(/^generic:/);
  });

  it("skips rows with invalid date", () => {
    const csv = `date;ticker;type;shares;price
garbled;AAPL;buy;10;100`;
    const r = parseBrokerCSV("generic", csv);
    expect(r.rows).toHaveLength(0);
    expect(r.skippedRows).toBe(1);
  });
});

describe("brokerImport / comdirect", () => {
  it("parses Umsatz-Export with Geschäftstag header", () => {
    const csv = `"Umsatzauskunft";"Kontoinhaber"
"Depotnummer"

"Geschäftstag";"Wertpapier/Bezeichnung";"WKN";"ISIN";"Stück/Nominal";"Ausführungskurs";"Währung";"Kurswert";"Provision";"Kaufen/Verkaufen"
"15.01.2026";"Apple Inc.";"865985";"US0378331005";"10";"185,50";"USD";"1855,00";"9,90";"Kauf"
"20.02.2026";"SAP SE";"716460";"DE0007164600";"5";"150,25";"EUR";"751,25";"4,90";"Verkauf"`;
    const r = parseBrokerCSV("comdirect", csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].type).toBe("buy");
    expect(r.rows[0].shares).toBe(10);
    expect(r.rows[0].price).toBeCloseTo(185.5, 2);
    expect(r.rows[0].fees).toBeCloseTo(9.9, 2);
    expect(r.rows[1].type).toBe("sell");
    expect(r.rows[1].ticker).toBe("DE0007164600");
  });

  it("returns warning if no header found", () => {
    const csv = "irgendwas;unrelated\nvalues;here";
    const r = parseBrokerCSV("comdirect", csv);
    expect(r.rows).toHaveLength(0);
    expect(r.warnings.some((w) => w.toLowerCase().includes("header"))).toBe(true);
  });
});

describe("brokerImport / ibkr", () => {
  it("parses a basic flex-query trades section", () => {
    const csv = `Statement,Header,Field Name,Field Value
Something,irrelevant,X,Y
Trades,Header,DataDiscriminator,AssetClass,Symbol,Quantity,TradePrice,TradeDate,Currency,Commission,Buy/Sell
Trades,Data,Order,STK,AAPL,10,185.50,2026-01-15,USD,-1.00,BUY
Trades,Data,Order,STK,MSFT,-5,420.30,2026-02-20,USD,-1.00,SELL`;
    // Unsere einfache Erkennung sucht eine Zeile mit "Symbol" + "Quantity"
    const r = parseBrokerCSV("ibkr", csv);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    const aapl = r.rows.find((x) => x.ticker === "AAPL");
    expect(aapl).toBeDefined();
    if (aapl) {
      expect(aapl.type).toBe("buy");
      expect(aapl.shares).toBe(10);
      expect(aapl.price).toBeCloseTo(185.5, 2);
      expect(aapl.date).toBe("2026-01-15");
    }
    const msft = r.rows.find((x) => x.ticker === "MSFT");
    if (msft) {
      expect(msft.type).toBe("sell");
      expect(msft.shares).toBe(5);
    }
  });
});

describe("brokerImport / tradeRepublic", () => {
  it("matches by flexible header names", () => {
    const csv = `date,type,ticker,shares,price,currency,fees,name
2026-01-15,buy,AAPL,10,185.50,USD,0,Apple
2026-02-20,sell,SAP.DE,5,150.25,EUR,0,SAP`;
    const r = parseBrokerCSV("tradeRepublic", csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].ticker).toBe("AAPL");
    expect(r.rows[0].type).toBe("buy");
  });
});
