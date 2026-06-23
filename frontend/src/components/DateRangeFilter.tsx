import { Button } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useT } from "../i18n";
import {
  DATE_PRESETS,
  PRESET_LABEL,
  rangeForPreset,
  type DatePreset,
} from "../lib/datePresets";

interface Props {
  preset: DatePreset;
  range: [Date | null, Date | null];
  onChange: (preset: DatePreset, range: [Date | null, Date | null]) => void;
}

/** Quick date-range filter: preset chips (All/Today/…/This month) + a custom
 * range picker. Reused by the Orders and Expenses pages. */
export function DateRangeFilter({ preset, range, onChange }: Props) {
  const t = useT();
  return (
    <>
      <Button.Group>
        {DATE_PRESETS.map((p) => (
          <Button
            key={p}
            size="xs"
            variant={preset === p ? "filled" : "default"}
            onClick={() => onChange(p, rangeForPreset(p))}
          >
            {t(PRESET_LABEL[p])}
          </Button>
        ))}
      </Button.Group>
      <DatePickerInput
        type="range"
        size="xs"
        w={210}
        valueFormat="DD/MM/YY"
        placeholder={`${t("from")} — ${t("to")}`}
        value={range}
        onChange={(v) => onChange("custom", v)}
        clearable
      />
    </>
  );
}
