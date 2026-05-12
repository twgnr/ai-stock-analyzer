export function fmtCurrency(value: number, currency = "EUR", locale = "de-DE") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtNumber(value: number, locale = "de-DE", fractionDigits = 2) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function fmtPercent(value: number, locale = "de-DE") {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

export function changeClass(value: number) {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-neutral-400";
}
