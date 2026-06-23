import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ActionIcon,
  Badge,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconTrash, IconTag } from "@tabler/icons-react";
import { api } from "../api/client";
import type { Expense, Currency, ExpenseCategory } from "../api/types";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { money, moneyCur, fmtDateTime } from "../lib/money";
import { MoneyInput } from "../components/MoneyInput";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { rangeQuery, type DatePreset } from "../lib/datePresets";

export function Expenses() {
  const t = useT();
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [range, setRange] = useState<[Date | null, Date | null]>([null, null]);
  const expensesQuery = useMemo(() => rangeQuery(range), [range]);
  const { data: expenses, loading, reload } = useList<Expense>(
    "/expenses",
    expensesQuery,
  );
  const { data: currencies } = useList<Currency>("/currencies");
  const { data: categories, reload: reloadCats } =
    useList<ExpenseCategory>("/expense-categories");

  const [opened, setOpened] = useState(false);
  const [amount, setAmount] = useState("");
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const currencyOptions = currencies.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name}`,
  }));
  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const shown = useMemo(
    () =>
      filterCat
        ? expenses.filter((e) => String(e.category_id ?? "") === filterCat)
        : expenses,
    [expenses, filterCat],
  );

  function openModal() {
    setAmount("");
    setCurrencyId(currencies.length ? String(currencies[0].id) : null);
    setCategoryId(null);
    setNote("");
    setOpened(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api("/expenses", {
        method: "POST",
        body: {
          amount: amount || "0",
          currency_id: Number(currencyId),
          category_id: categoryId ? Number(categoryId) : null,
          note: note || null,
        },
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

  async function remove(id: number) {
    if (!confirmKey("del_expense")) return;
    try {
      await api(`/expenses/${id}`, { method: "DELETE" });
      await reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <>
      <PageHeader title={t("nav_expenses")}>
        <DateRangeFilter
          preset={datePreset}
          range={range}
          onChange={(p, r) => {
            setDatePreset(p);
            setRange(r);
          }}
        />
        <Select
          placeholder={t("all_categories")}
          data={categoryOptions}
          value={filterCat}
          onChange={setFilterCat}
          clearable
          w={180}
          size="sm"
        />
        <Button
          variant="default"
          leftSection={<IconTag size={16} />}
          onClick={() => setCatModal(true)}
        >
          {t("categories")}
        </Button>
        <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
          {t("add_expense")}
        </Button>
      </PageHeader>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("when")}</Table.Th>
                <Table.Th>{t("category")}</Table.Th>
                <Table.Th ta="right">{t("amount")}</Table.Th>
                <Table.Th>{t("note")}</Table.Th>
                <Table.Th>{t("created_by")}</Table.Th>
                <Table.Th>{t("actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{fmtDateTime(e.created_at)}</Table.Td>
                  <Table.Td>
                    {e.category_name ? (
                      <Badge variant="light" color="grape">
                        {e.category_name}
                      </Badge>
                    ) : (
                      <Text c="dimmed" size="sm">
                        {t("no_category")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="money-num">
                    <Text fw={600} className="money-num">
                      {moneyCur(e.amount, e.currency_code)} {e.currency_code}
                    </Text>
                    {e.currency_code.toUpperCase() !== "UZS" && (
                      <Text size="xs" c="dimmed" className="money-num">
                        ≈ {money(e.amount_base)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{e.note || "—"}</Table.Td>
                  <Table.Td>{e.created_by}</Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => remove(e.id)}
                      aria-label={t("delete")}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!loading && shown.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {t("no_expenses")}
          </Text>
        )}
      </Card>

      <Modal opened={opened} onClose={() => setOpened(false)} title={t("add_expense")}>
        <Stack>
          <MoneyInput label={t("amount")} required value={amount} onChange={setAmount} />
          <Select
            label={t("currency")}
            required
            data={currencyOptions}
            value={currencyId}
            onChange={setCurrencyId}
          />
          <Select
            label={t("category")}
            placeholder={t("no_category")}
            data={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            clearable
            searchable
          />
          <TextInput
            label={t("note")}
            placeholder={t("optional")}
            value={note}
            onChange={(ev) => setNote(ev.currentTarget.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={() => setOpened(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {t("save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <CategoriesModal
        opened={catModal}
        onClose={() => setCatModal(false)}
        categories={categories}
        reload={reloadCats}
      />
    </>
  );
}

function CategoriesModal({
  opened,
  onClose,
  categories,
  reload,
}: {
  opened: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  reload: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/expense-categories", { method: "POST", body: { name: name.trim() } });
      setName("");
      reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirmKey("del_category")) return;
    try {
      await api(`/expense-categories/${id}`, { method: "DELETE" });
      reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("manage_categories")}>
      <Stack>
        <Group align="flex-end" gap="xs">
          <TextInput
            label={t("add_category")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{ flex: 1 }}
          />
          <Button onClick={add} loading={busy} leftSection={<IconPlus size={16} />}>
            {t("save")}
          </Button>
        </Group>
        <Stack gap={4}>
          {categories.length === 0 ? (
            <Text c="dimmed" ta="center" py="sm">
              —
            </Text>
          ) : (
            categories.map((c) => (
              <Group key={c.id} justify="space-between">
                <Text>{c.name}</Text>
                <Tooltip label={t("delete")}>
                  <ActionIcon color="red" variant="subtle" onClick={() => remove(c.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ))
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}
