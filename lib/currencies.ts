export type SupportedCurrency = "NGN" | "USD" | "GBP" | "EUR" | "KES" | "ZAR" | "CAD";

export interface CurrencyConfig {
  code: SupportedCurrency;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Record<SupportedCurrency, CurrencyConfig> = {
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian Naira (NGN)", locale: "en-NG" },
  USD: { code: "USD", symbol: "$", name: "US Dollar (USD)", locale: "en-US" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound (GBP)", locale: "en-GB" },
  EUR: { code: "EUR", symbol: "€", name: "Euro (EUR)", locale: "de-DE" },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling (KES)", locale: "en-KE" },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand (ZAR)", locale: "en-ZA" },
  CAD: { code: "CAD", symbol: "CA$", name: "Canadian Dollar (CAD)", locale: "en-CA" },
};

export function formatMoney(amount: number, currency: SupportedCurrency = "NGN", maximumFractionDigits = 0): string {
  const config = CURRENCIES[currency] || CURRENCIES.NGN;
  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.code,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${config.symbol}${amount.toLocaleString(undefined, { maximumFractionDigits })}`;
  }
}

export function detectCurrencyFromText(text: string): SupportedCurrency {
  const upper = text.toUpperCase();
  if (upper.includes("NGN") || text.includes("₦") || upper.includes("NAIRA")) return "NGN";
  if (upper.includes("GBP") || text.includes("£") || upper.includes("POUND")) return "GBP";
  if (upper.includes("EUR") || text.includes("€")) return "EUR";
  if (upper.includes("KES") || upper.includes("KSH") || upper.includes("SHILLING")) return "KES";
  if (upper.includes("ZAR") || upper.includes("RAND")) return "ZAR";
  if (upper.includes("CAD") || upper.includes("CA$")) return "CAD";
  if (upper.includes("USD") || text.includes("$")) return "USD";
  return "NGN"; // default
}
