// Mirror of the backend's normalize_uz_phone so the UI can validate/format an
// Uzbek mobile number before submit (the backend re-validates as the real guard).

function toDigits(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  else if (d.startsWith("8") && d.length === 12) d = "998" + d.slice(1);
  return d;
}

export function isValidUzPhone(raw: string): boolean {
  const d = toDigits(raw);
  return d.length === 12 && d.startsWith("998");
}

/** Canonical display form `+998 90 123 45 67`, or null if invalid. */
export function formatUzPhone(raw: string): string | null {
  const d = toDigits(raw);
  if (d.length !== 12 || !d.startsWith("998")) return null;
  return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
}

/** Live-typing helper: keep "+998 " prefix and group the 9 national digits. */
export function maskUzPhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return "+998" + (parts.length ? " " + parts.join(" ") : " ");
}
