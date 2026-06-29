import dayjs from "dayjs";

export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "month"
  | "custom";

/** Preset chips shown in the filter, in order. "custom" is implicit (picker). */
export const DATE_PRESETS: DatePreset[] = [
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "month",
];

/** i18n key for each preset's button label. */
export const PRESET_LABEL: Record<DatePreset, string> = {
  all: "all_time",
  today: "today",
  yesterday: "yesterday",
  last7: "last7",
  last30: "last30",
  month: "this_month",
  custom: "from",
};

export function rangeForPreset(p: DatePreset): [Date | null, Date | null] {
  const today = dayjs().startOf("day");
  switch (p) {
    case "today":
      return [today.toDate(), today.toDate()];
    case "yesterday": {
      const y = today.subtract(1, "day");
      return [y.toDate(), y.toDate()];
    }
    case "last7":
      return [today.subtract(6, "day").toDate(), today.toDate()];
    case "last30":
      return [today.subtract(29, "day").toDate(), today.toDate()];
    case "month":
      return [today.startOf("month").toDate(), today.toDate()];
    default:
      return [null, null];
  }
}

/** Build the {date_from, date_to} query for a [from, to] range. The "to" day is
 * sent as-is; the backend makes the window half-open by treating date_to as the
 * exclusive next-day boundary, so the "to" day is fully included. */
export function rangeQuery(range: [Date | null, Date | null]) {
  const [from, to] = range;
  return {
    date_from: from ? dayjs(from).format("YYYY-MM-DD") : undefined,
    date_to: to ? dayjs(to).format("YYYY-MM-DD") : undefined,
  };
}
