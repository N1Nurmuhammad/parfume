import { translate, getLang } from "../i18n";

const MAP: Record<string, string> = {
  cash: "pt_cash",
  card: "pt_card",
  transfer: "pt_transfer",
  debt: "pt_debt",
  cashback: "pt_cashback",
};

/** Localize the seeded default payment-type names; custom names pass through. */
export function payName(name: string): string {
  const k = MAP[String(name).trim().toLowerCase()];
  return k ? translate(getLang(), k) : name;
}
