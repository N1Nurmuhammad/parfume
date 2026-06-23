import { getLang } from "../i18n";

// uz falls back to ru-RU number formatting (space thousands, comma decimal):
// Chromium lacks uz-UZ number data and the convention matches.
const LOCALE: Record<string, string> = { en: "en-US", ru: "ru-RU", uz: "ru-RU" };

const loc = () => LOCALE[getLang()] || "en-US";

/** Full, 2-decimal localized amount: 1 234 567,00 */
export const money = (v: string | number) =>
  Number(v).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amount formatted for a specific currency: the base (UZS/so'm) follows the UI
 * locale; foreign currencies (USD, EUR, …) always use international en-US
 * formatting (comma thousands, dot decimal) so they aren't "translated". */
export const moneyCur = (v: string | number, code?: string) =>
  Number(v).toLocaleString(code && code.toUpperCase() !== "UZS" ? "en-US" : loc(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Compact amount for axes/badges: 1,2 млн */
export const moneyC = (v: string | number) =>
  Number(v).toLocaleString(loc(), { notation: "compact", maximumFractionDigits: 1 });

/** Plain integer with grouping. */
export const num = (v: string | number) => Number(v).toLocaleString(loc());

/** Strip space grouping back to a parseable numeric string. */
export const unformat = (s: string) => s.replace(/\s/g, "").replace(",", ".");

/** Group an integer/decimal string with spaces as the user types. */
export function groupDigits(s: string): string {
  s = String(s);
  if (!s.trim()) return "";
  const neg = s.trim().startsWith("-");
  const clean = s.replace(/[^\d.]/g, "");
  if (!clean) return neg ? "-" : "";
  const dot = clean.indexOf(".");
  const intp = (dot >= 0 ? clean.slice(0, dot) : clean).replace(/^0+(?=\d)/, "");
  const dec = dot >= 0 ? clean.slice(dot + 1).replace(/[^\d]/g, "").slice(0, 2) : null;
  const grouped = (intp === "" ? "0" : intp).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + (dec !== null ? grouped + "." + dec : grouped);
}

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(loc()) : "—";

export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString(loc()) : "—";

export const cleanPhone = (v: string) => v.replace(/[^\d+\-() ]/g, "");
