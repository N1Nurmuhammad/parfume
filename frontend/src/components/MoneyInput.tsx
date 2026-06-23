import { TextInput, type TextInputProps } from "@mantine/core";
import { groupDigits, unformat } from "../lib/money";

interface Props extends Omit<TextInputProps, "value" | "onChange"> {
  /** Raw numeric string (no grouping), e.g. "1234.5". */
  value: string;
  /** Receives the raw numeric string (spaces stripped). */
  onChange: (raw: string) => void;
  allowNegative?: boolean;
}

/**
 * Money text field that groups thousands with spaces as you type and reports the
 * raw numeric string upward. Mirrors the legacy wireMoney() behavior.
 */
export function MoneyInput({ value, onChange, allowNegative, ...rest }: Props) {
  return (
    <TextInput
      inputMode="decimal"
      value={groupDigits(value)}
      onChange={(e) => {
        let raw = unformat(e.currentTarget.value);
        if (!allowNegative) raw = raw.replace(/-/g, "");
        onChange(raw);
      }}
      styles={{ input: { fontVariantNumeric: "tabular-nums" } }}
      {...rest}
    />
  );
}
