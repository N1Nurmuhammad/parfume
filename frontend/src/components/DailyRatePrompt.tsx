import { useEffect, useState } from "react";
import { Modal, Stack, Text, Group, Button, Alert } from "@mantine/core";
import { IconCurrencyDollar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { api } from "../api/client";
import { useT } from "../i18n";
import { MoneyInput } from "./MoneyInput";
import { notifyError, notifySuccess } from "../lib/notify";
import { useAuth } from "../auth/AuthContext";
import type { Currency, CurrencyRate } from "../api/types";

/**
 * After login, if today has no exchange rate for the product currency, prompt the
 * admin to enter today's rates (prefilled with the last-known/effective rate so
 * they can confirm or adjust). Dismissable per-day via sessionStorage.
 */
export function DailyRatePrompt() {
  const t = useT();
  const { productCurrency } = useAuth();
  const today = dayjs().format("YYYY-MM-DD");
  const dismissKey = `rate_prompt_${today}`;

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Currency[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(dismissKey)) return;
    let alive = true;
    (async () => {
      try {
        const [currencies, exact, effective] = await Promise.all([
          api<Currency[]>("/currencies"),
          api<CurrencyRate[]>("/currencies/rates", { query: { date: today } }),
          api<CurrencyRate[]>("/currencies/rates", { query: { date: today, effective: "true" } }),
        ]);
        if (!alive) return;
        const nonBase = currencies.filter((c) => !c.is_base);
        if (!nonBase.length) return;

        const prod = currencies.find((c) => c.code === productCurrency);
        const prodSetToday = prod ? exact.some((r) => r.currency_id === prod.id) : true;
        // only nag when the currency that prices products has no rate today
        if (prodSetToday) return;

        const eff: Record<number, string> = {};
        for (const r of effective) eff[r.currency_id] = String(r.rate);
        const init: Record<number, string> = {};
        for (const c of nonBase) init[c.id] = eff[c.id] ?? "";

        setRows(nonBase);
        setValues(init);
        setOpen(true);
      } catch {
        /* don't block the app on a prompt failure */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(dismissKey, "1");
    setOpen(false);
  };

  const save = async () => {
    const toSave = rows.filter((c) => values[c.id] && Number(values[c.id]) > 0);
    if (!toSave.length) return dismiss();
    setBusy(true);
    try {
      await Promise.all(
        toSave.map((c) =>
          api("/currencies/rates", {
            method: "POST",
            body: { currency_id: c.id, rate_date: today, rate: values[c.id] },
          }),
        ),
      );
      notifySuccess(t("rates_saved"));
      sessionStorage.setItem(dismissKey, "1");
      setOpen(false);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={open}
      onClose={dismiss}
      title={t("set_today_rates")}
      centered
      closeOnClickOutside={false}
    >
      <Stack>
        <Alert color="amore" icon={<IconCurrencyDollar size={18} />}>
          {t("rate_prompt_msg")}
        </Alert>
        <Text size="sm" c="dimmed">
          {dayjs(today).format("DD/MM/YYYY")} · {t("rate")}
        </Text>
        {rows.map((c) => (
          <MoneyInput
            key={c.id}
            label={`${c.code} — ${c.name}`}
            value={values[c.id] ?? ""}
            onChange={(raw) => setValues((v) => ({ ...v, [c.id]: raw }))}
          />
        ))}
        <Group justify="flex-end">
          <Button variant="default" onClick={dismiss}>
            {t("later")}
          </Button>
          <Button onClick={save} loading={busy}>
            {t("save_rates")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
