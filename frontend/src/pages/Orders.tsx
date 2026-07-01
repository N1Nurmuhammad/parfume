import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Table,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Modal,
  Select,
  NumberInput,
  SegmentedControl,
  Divider,
  Drawer,
  Tooltip,
  Box,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import {
  IconPlus,
  IconTrash,
  IconEye,
  IconCash,
  IconUserPlus,
  IconPencil,
  IconArrowBackUp,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../api/client";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { money, moneyCur, num, fmtDateTime, fmtDate } from "../lib/money";
import { formatUzPhone, isValidUzPhone, maskUzPhone } from "../lib/phone";
import { MoneyInput } from "../components/MoneyInput";
import { payName } from "../lib/payName";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { rangeQuery, type DatePreset } from "../lib/datePresets";
import { useAuth } from "../auth/AuthContext";
import type {
  Order,
  OrderStatus,
  Client,
  Product,
  PaymentType,
  Currency,
  CurrencyRate,
  PaymentLineIn,
} from "../api/types";

let _key = 0;
const nextKey = () => ++_key;

interface ItemRow {
  key: number;
  productId: string | null;
  qty: number;
}
interface PayRow {
  key: number;
  ptId: string | null;
  currencyId: string | null;
  amount: string;
  // money handed back to the client (change/qaytim): the row's method is a real
  // Cash/Card type and the amount is sent as a negative line that nets out of
  // that method's till
  isChange: boolean;
}

// sum an order's payments grouped by currency (native units)
function payByCurrency(o: Order): { code: string; sum: number }[] {
  const m = new Map<string, number>();
  for (const p of o.payments) m.set(p.currency_code, (m.get(p.currency_code) ?? 0) + Number(p.amount));
  return [...m.entries()].map(([code, sum]) => ({ code, sum }));
}

export function Orders() {
  const t = useT();
  const { productCurrency } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [range, setRange] = useState<[Date | null, Date | null]>([null, null]);

  const ordersQuery = useMemo(
    () => ({ status: statusFilter || undefined, ...rangeQuery(range) }),
    [statusFilter, range],
  );
  const { data: orders, loading, reload } = useList<Order>("/orders", ordersQuery);

  const { data: clients, reload: reloadClients } = useList<Client>("/clients");
  const { data: products } = useList<Product>("/products");
  const { data: paymentTypes } = useList<PaymentType>("/payment-types");
  const { data: currencies } = useList<Currency>("/currencies");
  const [rates, setRates] = useState<CurrencyRate[]>([]);

  const today = dayjs().format("YYYY-MM-DD");
  const [ratesLoaded, setRatesLoaded] = useState(false);
  useEffect(() => {
    // effective=true: use the rate in effect today (latest <= today), matching
    // how the backend prices the order — not only rates set exactly today.
    api<CurrencyRate[]>("/currencies/rates", { query: { date: today, effective: "true" } })
      .then(setRates)
      .catch(() => {})
      .finally(() => setRatesLoaded(true));
  }, [today]);

  // currency_id -> base-units-per-1 (base currency = 1)
  const rateById = useMemo(() => {
    const m: Record<number, number> = {};
    for (const c of currencies) if (c.is_base) m[c.id] = 1;
    for (const r of rates) m[r.currency_id] = Number(r.rate);
    return m;
  }, [currencies, rates]);

  const baseCurrency = currencies.find((c) => c.is_base) ?? null;
  const prodCur = currencies.find((c) => c.code === productCurrency) ?? null;
  const prodRate = prodCur ? rateById[prodCur.id] ?? null : baseCurrency ? rateById[baseCurrency.id] : null;

  const [createOpen, setCreateOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [settle, setSettle] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  const canEditOrders = () => {
    if (!products.length || !paymentTypes.length) {
      notifyError(new Error(t("need_entities")));
      return false;
    }
    if (prodRate == null) {
      notifyError(new Error(t("set_product_rate", { c: productCurrency })));
      return false;
    }
    return true;
  };

  const openCreate = () => {
    if (canEditOrders()) setCreateOpen(true);
  };

  const openEdit = (o: Order) => {
    if (canEditOrders()) setEditOrder(o);
  };

  const handleDelete = async (o: Order) => {
    if (!confirmKey("del_order")) return;
    try {
      await api(`/orders/${o.id}`, { method: "DELETE" });
      notifySuccess(t("saved"));
      reload();
      reloadClients(); // balance / cashback returned to the client
    } catch (e) {
      notifyError(e);
    }
  };

  // closing / success for the create-or-edit modal
  const closeForm = () => {
    setCreateOpen(false);
    setEditOrder(null);
  };
  const onFormSaved = () => {
    closeForm();
    reload();
    reloadClients(); // balance / cashback may have changed
  };

  // auto-open the create modal when arrived from the dashboard "New order" button
  // (navigate("/orders", { state: { newOrder: true } })), once data has loaded
  const location = useLocation();
  const navigate = useNavigate();
  const wantNew = (location.state as { newOrder?: boolean } | null)?.newOrder;
  useEffect(() => {
    if (wantNew && ratesLoaded && products.length && paymentTypes.length && currencies.length) {
      navigate(location.pathname, { replace: true, state: {} }); // consume the flag
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew, ratesLoaded, products, paymentTypes, currencies]);

  const statusBadge = (o: Order) =>
    o.status === "delivery" ? (
      <Badge color="orange" variant="light">
        {t("st_delivery")}
      </Badge>
    ) : (
      <Badge color="teal" variant="light">
        {t("st_paid")}
      </Badge>
    );

  return (
    <Stack gap="md">
      <PageHeader title={t("nav_orders")}>
        <SegmentedControl
          size="xs"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "" | OrderStatus)}
          data={[
            { value: "", label: t("all_orders") },
            { value: "paid", label: t("st_paid") },
            { value: "delivery", label: t("st_delivery") },
          ]}
        />
        <DateRangeFilter
          preset={datePreset}
          range={range}
          onChange={(p, r) => {
            setDatePreset(p);
            setRange(r);
          }}
        />
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          {t("new_order")}
        </Button>
      </PageHeader>

      <Card withBorder p={0} radius="md">
        <Table.ScrollContainer minWidth={820}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>{t("time")}</Table.Th>
                <Table.Th>{t("client")}</Table.Th>
                <Table.Th>{t("items")}</Table.Th>
                <Table.Th ta="right">{t("total")}</Table.Th>
                <Table.Th>{t("status")}</Table.Th>
                <Table.Th>{t("created_by")}</Table.Th>
                <Table.Th ta="right">{t("actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {orders.map((o) => (
                <Table.Tr key={o.id}>
                  <Table.Td>{o.id}</Table.Td>
                  <Table.Td c="dimmed">{fmtDateTime(o.paid_at ?? o.created_at)}</Table.Td>
                  <Table.Td>{o.client_name}</Table.Td>
                  <Table.Td c="dimmed">
                    {o.items.reduce((a, it) => a + it.quantity, 0)} · {o.items.length}
                  </Table.Td>
                  <Table.Td ta="right" className="money-num">
                    {(() => {
                      const groups = payByCurrency(o);
                      if (groups.length === 0) {
                        // unpaid delivery: show the order value (so'm)
                        return <Text fw={600} className="money-num">{money(o.total)}</Text>;
                      }
                      const hasForeign = groups.some((g) => g.code.toUpperCase() !== "UZS");
                      return (
                        <>
                          {groups.map((g) => (
                            <Text key={g.code} fw={600} className="money-num">
                              {moneyCur(g.sum, g.code)} {g.code}
                            </Text>
                          ))}
                          {hasForeign && (
                            <Text size="xs" c="dimmed" className="money-num">
                              ≈ {money(o.total)}
                            </Text>
                          )}
                        </>
                      );
                    })()}
                  </Table.Td>
                  <Table.Td>
                    {statusBadge(o)}
                    {o.due_date && (
                      <Text size="xs" c="dimmed">
                        {t("due_date")}: {fmtDate(o.due_date)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td c="dimmed">{o.created_by}</Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {o.status === "delivery" && (
                        <Tooltip label={t("mark_paid")}>
                          <ActionIcon variant="light" color="teal" onClick={() => setSettle(o)}>
                            <IconCash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <ActionIcon variant="subtle" onClick={() => setDetail(o)}>
                        <IconEye size={16} />
                      </ActionIcon>
                      <Tooltip label={t("edit_order")}>
                        <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(o)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t("delete")}>
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(o)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!loading && orders.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {t("no_orders")}
          </Text>
        )}
      </Card>

      {(createOpen || editOrder) && (
        <CreateOrderModal
          opened={createOpen || !!editOrder}
          editOrder={editOrder}
          onClose={closeForm}
          clients={clients}
          products={products}
          paymentTypes={paymentTypes}
          currencies={currencies}
          rateById={rateById}
          prodRate={prodRate!}
          baseCurrency={baseCurrency}
          onCreated={onFormSaved}
          onClientAdded={reloadClients}
        />
      )}

      {settle && (
        <SettleModal
          order={settle}
          onClose={() => setSettle(null)}
          paymentTypes={paymentTypes}
          currencies={currencies}
          rateById={rateById}
          baseCurrency={baseCurrency}
          onSettled={() => {
            setSettle(null);
            reload();
          }}
        />
      )}

      <OrderDetail order={detail} onClose={() => setDetail(null)} />
    </Stack>
  );
}

// ───────────────────────── payment rows (shared) ─────────────────────────

function PaymentEditor({
  rows,
  setRows,
  paymentTypes,
  currencies,
  rateById,
  totalSom,
  cashbackDefault,
}: {
  rows: PayRow[];
  setRows: (r: PayRow[]) => void;
  paymentTypes: PaymentType[];
  currencies: Currency[];
  rateById: Record<number, number>;
  totalSom: number;
  // when a cashback payment line is picked, default its amount to the client's
  // full available cashback (redeemed in the base currency)
  cashbackDefault?: number;
}) {
  const t = useT();
  const base = currencies.find((c) => c.is_base) ?? currencies[0];

  // real cash-out methods only (Cash / Card / …); change is a per-row toggle now
  // and the legacy change/qaytim type is hidden from the dropdown
  const methodTypes = paymentTypes.filter((p) => !p.is_change);

  // selecting a payment type: a cashback type prefills the full cashback in base
  const pickType = (key: number, ptId: string | null) => {
    const pt = paymentTypes.find((p) => String(p.id) === ptId);
    if (pt?.is_cashback && cashbackDefault != null) {
      update(key, {
        ptId,
        currencyId: base ? String(base.id) : null,
        amount: cashbackDefault > 0 ? String(cashbackDefault) : "",
      });
    } else {
      update(key, { ptId });
    }
  };

  // toggle a row between a normal payment and money handed back (change): when
  // turning change on, default its currency to the one the client overpaid in
  const toggleChange = (key: number, on: boolean) =>
    update(key, on ? { isChange: true, currencyId: overpaidCurrencyId(key) } : { isChange: false });

  // currency of the non-change payment line contributing the most (in base units),
  // i.e. what the client mainly paid with — used to default a change line's currency
  const overpaidCurrencyId = (exceptKey: number): string | null => {
    let bestId: string | null = null;
    let bestBase = 0;
    for (const r of rows) {
      if (r.key === exceptKey || !r.currencyId || isChangeRow(r)) continue;
      const inBase = (Number(r.amount) || 0) * (rateById[Number(r.currencyId)] ?? 0);
      if (inBase > bestBase) {
        bestBase = inBase;
        bestId = r.currencyId;
      }
    }
    return bestId ?? (base ? String(base.id) : null);
  };

  // a change/qaytim line is money handed back — it subtracts from the paid total
  const isChangeRow = (r: PayRow) => r.isChange;

  const allocated = rows.reduce((a, r) => {
    const rate = r.currencyId ? rateById[Number(r.currencyId)] ?? 0 : 0;
    const sign = isChangeRow(r) ? -1 : 1;
    return a + sign * (Number(r.amount) || 0) * rate;
  }, 0);
  const remaining = totalSom - allocated;

  // breakdown of what's being collected, grouped by currency then payment type
  // (e.g. UZS → Cash / Card, USD → Cash). Shown in each currency's own units.
  const breakdown = useMemo(() => {
    const byCur = new Map<string, { code: string; methods: Map<string, number> }>();
    for (const r of rows) {
      const amt = Number(r.amount);
      // change rows are money handed back, not collected — exclude from the
      // "collected" preview (the amount to return is shown separately below)
      if (!r.ptId || !r.currencyId || !(amt > 0) || isChangeRow(r)) continue;
      const cur = currencies.find((c) => String(c.id) === r.currencyId);
      const pt = paymentTypes.find((p) => String(p.id) === r.ptId);
      if (!cur || !pt) continue;
      if (!byCur.has(cur.code)) byCur.set(cur.code, { code: cur.code, methods: new Map() });
      const m = byCur.get(cur.code)!.methods;
      m.set(pt.name, (m.get(pt.name) ?? 0) + amt);
    }
    return [...byCur.values()];
  }, [rows, currencies, paymentTypes]);

  const update = (key: number, patch: Partial<PayRow>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const fill = (r: PayRow) => {
    const rate = r.currencyId ? rateById[Number(r.currencyId)] ?? 1 : 1;
    const others = rows
      .filter((x) => x.key !== r.key)
      .reduce((a, x) => {
        const rt = x.currencyId ? rateById[Number(x.currencyId)] ?? 0 : 0;
        return a + (Number(x.amount) || 0) * rt;
      }, 0);
    const need = Math.max(0, totalSom - others) / (rate || 1);
    update(r.key, { amount: need.toFixed(2) });
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>{t("payments")}</Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() =>
            setRows([
              ...rows,
              {
                key: nextKey(),
                ptId: methodTypes[0] ? String(methodTypes[0].id) : null,
                currencyId: base ? String(base.id) : null,
                amount: "",
                isChange: false,
              },
            ])
          }
        >
          {t("add_payment")}
        </Button>
      </Group>

      {rows.map((r) => (
        <Group key={r.key} gap="xs" wrap="nowrap" align="flex-end">
          <Select
            label={undefined}
            placeholder={t("payment_type")}
            data={methodTypes.map((p) => ({ value: String(p.id), label: payName(p.name) }))}
            value={r.ptId}
            onChange={(v) => pickType(r.key, v)}
            style={{ flex: 1.4 }}
            searchable
          />
          <Select
            placeholder={t("currency")}
            data={currencies.map((c) => ({ value: String(c.id), label: c.code }))}
            value={r.currencyId}
            onChange={(v) => update(r.key, { currencyId: v })}
            w={90}
          />
          <Box style={{ flex: 1 }}>
            <MoneyInput value={r.amount} onChange={(a) => update(r.key, { amount: a })} placeholder="0" />
          </Box>
          <Tooltip label={t("money_back")}>
            <ActionIcon
              variant={r.isChange ? "filled" : "subtle"}
              color="orange"
              onClick={() => toggleChange(r.key, !r.isChange)}
              aria-label={t("money_back")}
            >
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" variant="default" onClick={() => fill(r)}>
            {t("fill")}
          </Button>
          <ActionIcon color="red" variant="subtle" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}

      {breakdown.length > 0 && (
        <Card withBorder padding="xs" radius="sm" bg="var(--mantine-color-default)">
          <Text size="xs" c="dimmed" fw={600} mb={4}>
            {t("by_currency")}
          </Text>
          <Stack gap={4}>
            {breakdown.map((cur) => (
              <Group key={cur.code} gap="xs" wrap="nowrap" align="center">
                <Badge variant="light" w={56} style={{ flexShrink: 0 }}>
                  {cur.code}
                </Badge>
                <Text size="sm">
                  {[...cur.methods.entries()]
                    .map(([pt, sum]) => `${payName(pt)}: ${moneyCur(sum, cur.code)}`)
                    .join("  ·  ")}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("remaining")}
        </Text>
        <Text size="sm" fw={600} c={Math.abs(remaining) < 0.5 ? "teal" : "red"} className="money-num">
          {money(remaining)}
        </Text>
      </Group>

      {remaining < -0.5 && (
        // client paid more than the total: tell the cashier how much to hand back
        // (add a change/qaytim payment line for this amount to balance the order)
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t("change_to_return")}
          </Text>
          <Text size="sm" fw={600} c="teal" className="money-num">
            {money(-remaining)}
          </Text>
        </Group>
      )}
    </Stack>
  );
}

// ───────────────────────── create order ─────────────────────────

function CreateOrderModal({
  opened,
  editOrder,
  onClose,
  clients,
  products,
  paymentTypes,
  currencies,
  rateById,
  prodRate,
  baseCurrency,
  onCreated,
  onClientAdded,
}: {
  opened: boolean;
  editOrder?: Order | null;
  onClose: () => void;
  clients: Client[];
  products: Product[];
  paymentTypes: PaymentType[];
  currencies: Currency[];
  rateById: Record<number, number>;
  prodRate: number;
  baseCurrency: Currency | null;
  onCreated: () => void;
  onClientAdded: () => void;
}) {
  const t = useT();
  const { productCurrency } = useAuth();
  const [clientId, setClientId] = useState<string | null>(
    editOrder ? String(editOrder.client_id) : null,
  );
  const [cashbackPct, setCashbackPct] = useState<string | number>(
    editOrder ? Number(editOrder.cashback_percent) : 0,
  );
  const [status, setStatus] = useState<OrderStatus>(
    editOrder ? (editOrder.status as OrderStatus) : "paid",
  );
  const [dueDate, setDueDate] = useState<Date | null>(
    editOrder?.due_date ? new Date(editOrder.due_date) : null,
  );
  const [items, setItems] = useState<ItemRow[]>(
    editOrder
      ? editOrder.items.map((it) => ({
          key: nextKey(),
          productId: String(it.product_id),
          qty: it.quantity,
        }))
      : [{ key: nextKey(), productId: null, qty: 1 }],
  );
  const [payments, setPayments] = useState<PayRow[]>(
    editOrder
      ? editOrder.payments.map((p) => ({
          key: nextKey(),
          ptId: String(p.payment_type_id),
          currencyId: String(p.currency_id),
          // change lines are stored negative — show the positive amount and mark
          // the row as money-back
          amount: String(Math.abs(Number(p.amount))),
          isChange: Number(p.amount) < 0,
        }))
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);

  const productById = useMemo(() => {
    const m: Record<number, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const totalSom = items.reduce((a, it) => {
    if (!it.productId) return a;
    const p = productById[Number(it.productId)];
    if (!p) return a;
    return a + Number(p.full_price) * prodRate * (it.qty || 0);
  }, 0);

  const client = clients.find((c) => String(c.id) === clientId) ?? null;
  // a paid order can include a debt line; capture when that debt is due
  const hasDebtLine = payments.some((r) => {
    const pt = paymentTypes.find((p) => String(p.id) === r.ptId);
    return !!pt?.is_debt;
  });

  // start the paid path with one payment line filling the total
  useEffect(() => {
    if (status === "paid" && payments.length === 0 && paymentTypes.length) {
      const method = paymentTypes.find((p) => !p.is_change) ?? paymentTypes[0];
      setPayments([
        {
          key: nextKey(),
          ptId: String(method.id),
          currencyId: baseCurrency ? String(baseCurrency.id) : null,
          amount: "",
          isChange: false,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const submit = async () => {
    if (!clientId) return notifyError(new Error(t("select_client")));
    const validItems = items.filter((it) => it.productId && it.qty > 0);
    if (!validItems.length) return notifyError(new Error(t("no_products")));

    if (status === "paid") {
      const allocated = payments.reduce((a, r) => {
        const rate = r.currencyId ? rateById[Number(r.currencyId)] ?? 0 : 0;
        return a + (r.isChange ? -1 : 1) * (Number(r.amount) || 0) * rate;
      }, 0);
      if (Math.abs(allocated - totalSom) > 0.5 * payments.length + 0.5) {
        return notifyError(new Error(t("pay_sum_msg", { a: money(allocated), b: money(totalSom) })));
      }
    }

    const payload: {
      client_id: number;
      cashback_percent: string;
      items: { product_id: number; quantity: number }[];
      payments: PaymentLineIn[];
      status: OrderStatus;
      due_date?: string | null;
    } = {
      client_id: Number(clientId),
      cashback_percent: String(cashbackPct || 0),
      items: validItems.map((it) => ({ product_id: Number(it.productId), quantity: it.qty })),
      payments:
        status === "paid"
          ? payments
              .filter((r) => r.ptId && r.currencyId && Number(r.amount) > 0)
              .map((r) => ({
                payment_type_id: Number(r.ptId),
                currency_id: Number(r.currencyId),
                amount: r.amount,
                is_change: r.isChange,
              }))
          : [],
      status,
      // due date applies to a delivery or to a paid order with a debt line
      due_date: dueDate ? dayjs(dueDate).format("YYYY-MM-DD") : null,
    };

    setBusy(true);
    try {
      if (editOrder) {
        await api(`/orders/${editOrder.id}`, { method: "PUT", body: payload });
      } else {
        await api("/orders", { method: "POST", body: payload });
      }
      notifySuccess(t("saved"));
      onCreated();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={editOrder ? t("edit_order") : t("new_order")} size="xl" centered>
      <Stack gap="md">
        <Group align="flex-end" gap="xs">
          <Select
            label={t("client")}
            placeholder={t("select_client")}
            data={clients.map((c) => ({ value: String(c.id), label: `${c.name} · ${c.phone_number}` }))}
            value={clientId}
            onChange={setClientId}
            searchable
            nothingFoundMessage={t("no_match")}
            style={{ flex: 1 }}
          />
          <Tooltip label={t("add_client")}>
            <ActionIcon variant="light" size="lg" onClick={() => setQuickAdd(true)}>
              <IconUserPlus size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {client && Number(client.cashback) > 0 && (
          <Text size="xs" c="dimmed">
            {t("cashback")}: {money(client.cashback)}
          </Text>
        )}

        <Divider label={t("items")} labelPosition="left" />
        <Stack gap="xs">
          {items.map((it) => (
            <Group key={it.key} gap="xs" wrap="nowrap" align="flex-end">
              <Select
                placeholder={t("select_product")}
                data={products.map((p) => ({
                  value: String(p.id),
                  label: `${p.name} — ${moneyCur(p.full_price, productCurrency)} ${productCurrency} · ${t("cargo")}-${moneyCur(p.cargo_price, productCurrency)} · ${t("stock")} ${p.quantity}`,
                }))}
                value={it.productId}
                onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, productId: v } : x)))}
                searchable
                nothingFoundMessage={t("no_match")}
                style={{ flex: 1 }}
              />
              <NumberInput
                value={it.qty}
                onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, qty: Number(v) || 0 } : x)))}
                min={1}
                w={90}
                placeholder={t("qty")}
              />
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={() => setItems(items.filter((x) => x.key !== it.key))}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setItems([...items, { key: nextKey(), productId: null, qty: 1 }])}
            >
              {t("add_item")}
            </Button>
          </Group>
        </Stack>

        <Group grow>
          <NumberInput
            label={t("cashback_pct")}
            value={cashbackPct}
            onChange={setCashbackPct}
            min={0}
            max={100}
            suffix="%"
          />
          <Box>
            <Text size="sm" fw={500} mb={4}>
              {t("order_status")}
            </Text>
            <SegmentedControl
              fullWidth
              value={status}
              onChange={(v) => setStatus(v as OrderStatus)}
              data={[
                { value: "paid", label: t("paid_now") },
                { value: "delivery", label: t("pay_later") },
              ]}
            />
          </Box>
        </Group>

        {status === "delivery" ? (
          <DateInput
            label={t("due_date")}
            value={dueDate}
            onChange={(d) => setDueDate(d ? new Date(d) : null)}
            valueFormat="YYYY-MM-DD"
            clearable
          />
        ) : (
          <>
            <PaymentEditor
              rows={payments}
              setRows={setPayments}
              paymentTypes={paymentTypes}
              currencies={currencies}
              rateById={rateById}
              totalSom={totalSom}
              cashbackDefault={client ? Number(client.cashback) : 0}
            />
            {hasDebtLine && (
              <DateInput
                label={t("due_date")}
                description={t("debt_warning")}
                value={dueDate}
                onChange={(d) => setDueDate(d ? new Date(d) : null)}
                valueFormat="YYYY-MM-DD"
                clearable
              />
            )}
          </>
        )}

        <Divider />
        <Group justify="space-between">
          <Text c="dimmed">{t("total")}</Text>
          <Text size="xl" fw={700} className="money-num">
            {money(totalSom)}
          </Text>
        </Group>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} loading={busy}>
            {editOrder ? t("save_changes") : t("create_order")}
          </Button>
        </Group>
      </Stack>

      {quickAdd && (
        <QuickAddClient
          onClose={() => setQuickAdd(false)}
          onAdded={(c) => {
            setQuickAdd(false);
            onClientAdded();
            setClientId(String(c.id));
          }}
        />
      )}
    </Modal>
  );
}

function QuickAddClient({ onClose, onAdded }: { onClose: () => void; onAdded: (c: Client) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !phone.trim()) return notifyError(new Error(t("name_phone_required")));
    const normalizedPhone = formatUzPhone(phone);
    if (!normalizedPhone) return notifyError(new Error(t("invalid_phone")));
    setBusy(true);
    try {
      const c = await api<Client>("/clients", {
        method: "POST",
        body: { name, phone_number: normalizedPhone, birth_date: null },
      });
      notifySuccess(t("saved"));
      onAdded(c);
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={t("add_client")} centered>
      <Stack>
        <TextInput label={t("name")} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput
          label={t("phone")}
          required
          placeholder="+998 90 123 45 67"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(maskUzPhone(e.currentTarget.value))}
          error={phone.trim() && !isValidUzPhone(phone) ? t("invalid_phone") : undefined}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} loading={busy}>
            {t("save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ───────────────────────── settle (mark paid) ─────────────────────────

function SettleModal({
  order,
  onClose,
  paymentTypes,
  currencies,
  rateById,
  baseCurrency,
  onSettled,
}: {
  order: Order;
  onClose: () => void;
  paymentTypes: PaymentType[];
  currencies: Currency[];
  rateById: Record<number, number>;
  baseCurrency: Currency | null;
  onSettled: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<PayRow[]>([
    {
      key: nextKey(),
      ptId: (paymentTypes.find((p) => !p.is_change) ?? paymentTypes[0])
        ? String((paymentTypes.find((p) => !p.is_change) ?? paymentTypes[0]).id)
        : null,
      currencyId: baseCurrency ? String(baseCurrency.id) : null,
      amount: "",
      isChange: false,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const totalSom = Number(order.total);

  const submit = async () => {
    const lines = rows.filter((r) => r.ptId && r.currencyId && Number(r.amount) > 0);
    if (!lines.length) return notifyError(new Error(t("enter_amount")));
    setBusy(true);
    try {
      await api(`/orders/${order.id}/pay`, {
        method: "POST",
        body: {
          payments: lines.map((r) => ({
            payment_type_id: Number(r.ptId),
            currency_id: Number(r.currencyId),
            amount: r.amount,
            is_change: r.isChange,
          })),
        },
      });
      notifySuccess(t("saved"));
      onSettled();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={`${t("settle_order")} #${order.id}`} size="lg" centered>
      <Stack>
        <Group justify="space-between">
          <Text c="dimmed">
            {order.client_name} · {t("total")}
          </Text>
          <Text fw={700} className="money-num">
            {money(order.total)}
          </Text>
        </Group>
        <PaymentEditor
          rows={rows}
          setRows={setRows}
          paymentTypes={paymentTypes}
          currencies={currencies}
          rateById={rateById}
          totalSom={totalSom}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button color="teal" onClick={submit} loading={busy}>
            {t("mark_paid")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ───────────────────────── detail drawer ─────────────────────────

function OrderDetail({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const t = useT();
  return (
    <Drawer opened={!!order} onClose={onClose} position="right" size="md" title={order ? `#${order.id}` : ""}>
      {order && (
        <Stack>
          <Group justify="space-between">
            <Text fw={600}>{order.client_name}</Text>
            {order.status === "delivery" ? (
              <Badge color="orange">{t("st_delivery")}</Badge>
            ) : (
              <Badge color="teal">{t("st_paid")}</Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {fmtDateTime(order.paid_at ?? order.created_at)} · {order.created_by}
          </Text>
          {order.due_date && (
            <Badge color="orange" variant="light" w="fit-content">
              {t("due_date")}: {fmtDate(order.due_date)}
            </Badge>
          )}

          <Divider label={t("items")} labelPosition="left" />
          <Table>
            <Table.Tbody>
              {order.items.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.product_name}</Table.Td>
                  <Table.Td c="dimmed">×{it.quantity}</Table.Td>
                  <Table.Td ta="right" className="money-num">
                    {money(Number(it.price) * it.quantity)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {order.payments.length > 0 && (
            <>
              <Divider label={t("payments")} labelPosition="left" />
              <Table>
                <Table.Tbody>
                  {order.payments.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>{payName(p.payment_type_name)}</Table.Td>
                      <Table.Td c="dimmed">
                        {moneyCur(p.amount, p.currency_code)} {p.currency_code}
                      </Table.Td>
                      <Table.Td ta="right" className="money-num">
                        {money(p.amount_base)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}

          <Divider />
          <Group justify="space-between">
            <Text c="dimmed">{t("total")}</Text>
            <Text fw={700} className="money-num">
              {money(order.total)}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text c="dimmed">{t("profit")}</Text>
            <Text className="money-num">{money(order.profit)}</Text>
          </Group>
          {Number(order.cashback_earned) > 0 && (
            <Group justify="space-between">
              <Text c="dimmed">{t("cashback_earned")}</Text>
              <Text c="grape" className="money-num">
                {money(order.cashback_earned)}
              </Text>
            </Group>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
