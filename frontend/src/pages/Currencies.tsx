import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconHistory, IconPlus, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../api/client";
import type { Currency, CurrencyRate } from "../api/types";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { money, fmtDate } from "../lib/money";
import { MoneyInput } from "../components/MoneyInput";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";

interface FormState {
  code: string;
  name: string;
  is_base: boolean;
}

const EMPTY_FORM: FormState = { code: "", name: "", is_base: false };

const fmt = (d: Date | null) => dayjs(d ?? new Date()).format("YYYY-MM-DD");

export function Currencies() {
  const t = useT();
  const { data: currencies, loading, reload } = useList<Currency>("/currencies");

  const [opened, setOpened] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  const [rates, setRates] = useState<Record<number, string>>({});
  const [savingRates, setSavingRates] = useState(false);

  const [histCur, setHistCur] = useState<Currency | null>(null);
  const [histRows, setHistRows] = useState<CurrencyRate[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  async function openHistory(c: Currency) {
    setHistCur(c);
    setHistLoading(true);
    setHistRows([]);
    try {
      // backend returns newest-first, last 60 days
      const res = await api<CurrencyRate[]>(`/currencies/${c.id}/rates`);
      setHistRows(res);
    } catch (e) {
      notifyError(e);
    } finally {
      setHistLoading(false);
    }
  }

  const nonBase = currencies.filter((c) => !c.is_base);
  const base = currencies.find((c) => c.is_base) ?? null;

  async function loadRates(d: Date) {
    try {
      const res = await api<CurrencyRate[]>("/currencies/rates", {
        query: { date: fmt(d) },
      });
      const next: Record<number, string> = {};
      for (const r of res) next[r.currency_id] = r.rate;
      setRates(next);
    } catch (e) {
      notifyError(e);
    }
  }

  useEffect(() => {
    loadRates(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fmt(date)]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setOpened(true);
  }

  function close() {
    setOpened(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/currencies", {
        method: "POST",
        body: { code: form.code, name: form.name, is_base: form.is_base },
      });
      await reload();
      notifySuccess(t("saved"));
      setOpened(false);
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Currency) {
    if (!confirmKey("del_currency")) return;
    try {
      await api(`/currencies/${c.id}`, { method: "DELETE" });
      await reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    }
  }

  async function handleSaveRates() {
    setSavingRates(true);
    try {
      const rateDate = fmt(date);
      const reqs = nonBase
        .filter((c) => (rates[c.id] ?? "").trim() !== "")
        .map((c) =>
          api("/currencies/rates", {
            method: "POST",
            body: { currency_id: c.id, rate_date: rateDate, rate: rates[c.id] },
          }),
        );
      await Promise.all(reqs);
      notifySuccess(t("rates_saved"));
      await loadRates(date);
    } catch (e) {
      notifyError(e);
    } finally {
      setSavingRates(false);
    }
  }

  return (
    <>
      <PageHeader title={t("nav_currencies")}>
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
          {t("add_currency")}
        </Button>
      </PageHeader>

      <Stack gap="md">
        <Card withBorder>
          <Text fw={600} mb="sm">
            {t("currency")}
          </Text>
          {!loading && currencies.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {t("no_currencies")}
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={480}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("code")}</Table.Th>
                    <Table.Th>{t("name")}</Table.Th>
                    <Table.Th>{t("base")}</Table.Th>
                    <Table.Th>{t("actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {currencies.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.code}</Table.Td>
                      <Table.Td>{c.name}</Table.Td>
                      <Table.Td>
                        {c.is_base ? (
                          <Badge>{t("base")}</Badge>
                        ) : (
                          <Text c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {!c.is_base && (
                          <Group gap={4} wrap="nowrap">
                            <Tooltip label={t("history")}>
                              <ActionIcon
                                variant="subtle"
                                onClick={() => openHistory(c)}
                                aria-label={t("history")}
                              >
                                <IconHistory size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => handleDelete(c)}
                              aria-label={t("delete")}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>

        <Card withBorder>
          <Text fw={600} mb="sm">
            {t("daily_rates")}
          </Text>
          <Stack gap="md">
            <DateInput
              label={t("rate_date")}
              valueFormat="YYYY-MM-DD"
              value={date}
              onChange={(d) => setDate(d ?? new Date())}
            />
            {base && (
              <Group justify="space-between" wrap="nowrap">
                <Text fw={500}>{base.code}</Text>
                <Text c="dimmed">{money(1)}</Text>
              </Group>
            )}
            {nonBase.map((c) => (
              <MoneyInput
                key={c.id}
                label={c.code}
                placeholder={t("no_rate")}
                value={rates[c.id] ?? ""}
                onChange={(raw) =>
                  setRates((r) => ({ ...r, [c.id]: raw }))
                }
              />
            ))}
            {nonBase.length > 0 && (
              <Group justify="flex-end">
                <Button onClick={handleSaveRates} loading={savingRates}>
                  {t("save_rates")}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      </Stack>

      <Modal opened={opened} onClose={close} title={t("add_currency")} centered>
        <Stack gap="md">
          <TextInput
            label={t("code")}
            required
            value={form.code}
            onChange={(e) =>
              setForm((f) => ({ ...f, code: e.currentTarget.value.toUpperCase() }))
            }
          />
          <TextInput
            label={t("name")}
            required
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.currentTarget.value }))
            }
          />
          <Switch
            label={t("base")}
            checked={form.is_base}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_base: e.currentTarget.checked }))
            }
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t("save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        opened={!!histCur}
        onClose={() => setHistCur(null)}
        position="right"
        size="sm"
        title={histCur ? `${histCur.code} · ${t("history")}` : ""}
      >
        {!histLoading && histRows.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("no_rate")}
          </Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("rate_date")}</Table.Th>
                <Table.Th ta="right">{t("rate")}</Table.Th>
                <Table.Th ta="right">{t("change")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {histRows.map((r, i) => {
                // rows are newest-first; compare to the next (older) day
                const prev = histRows[i + 1];
                const delta = prev ? Number(r.rate) - Number(prev.rate) : 0;
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td>{fmtDate(r.rate_date)}</Table.Td>
                    <Table.Td ta="right" className="money-num">
                      {money(r.rate)}
                    </Table.Td>
                    <Table.Td ta="right" className="money-num">
                      {prev && delta !== 0 ? (
                        <Text span c={delta > 0 ? "teal" : "red"} size="sm">
                          {delta > 0 ? "▲" : "▼"} {money(Math.abs(delta))}
                        </Text>
                      ) : (
                        <Text span c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Drawer>
    </>
  );
}
