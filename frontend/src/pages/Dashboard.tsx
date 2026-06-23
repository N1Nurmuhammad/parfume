import { useEffect, useMemo, useState } from "react";
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Stack,
  Button,
  Title,
  Badge,
  Table,
  Loader,
  Center,
  ColorSwatch,
  rem,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { AreaChart, DonutChart } from "@mantine/charts";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../api/client";
import { useT } from "../i18n";
import { money, moneyC, moneyCur, num, fmtDate } from "../lib/money";
import { payName } from "../lib/payName";
import { notifyError } from "../lib/notify";
import { useAuth } from "../auth/AuthContext";
import type {
  Summary,
  TimeseriesPoint,
  TopProduct,
  PaymentBreakdown,
  CurrencyBreakdown,
  CurrencyRate,
  DebtReport,
} from "../api/types";

type Preset = "today" | "last7" | "last30" | "month";

const DONUT_COLORS = [
  "amore.6",
  "teal.6",
  "blue.6",
  "yellow.6",
  "grape.6",
  "cyan.6",
  "orange.6",
  "lime.6",
];

function rangeFor(preset: Preset): [Date, Date] {
  const today = dayjs().startOf("day");
  if (preset === "today") return [today.toDate(), today.toDate()];
  if (preset === "last7") return [today.subtract(6, "day").toDate(), today.toDate()];
  if (preset === "last30") return [today.subtract(29, "day").toDate(), today.toDate()];
  return [today.startOf("month").toDate(), today.toDate()];
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="xl" fw={700} c={color} mt={4} className="money-num">
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Card>
  );
}

const CUR_SYMBOL: Record<string, string> = { USD: "$", EUR: "€" };

export function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { productCurrency } = useAuth();

  // The books are stored in base so'm; the owner thinks in the product/main
  // currency (USD). Fetch today's effective rate and convert so'm figures for
  // display. Payments are still taken in their own currencies (cashier card).
  const today = dayjs().format("YYYY-MM-DD");
  const [reportRate, setReportRate] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api<CurrencyRate[]>("/currencies/rates", { query: { date: today, effective: "true" } })
      .then((rs) => {
        if (!alive) return;
        const r = rs.find((x) => x.currency_code === productCurrency);
        setReportRate(r ? Number(r.rate) : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [today, productCurrency]);

  // so'm -> main currency display string (falls back to so'm if no rate yet)
  const mainMoney = (som: string | number) => {
    if (!reportRate) return money(som);
    const v = Number(som) / reportRate;
    const s = CUR_SYMBOL[productCurrency];
    return s ? `${s}${moneyCur(v, productCurrency)}` : `${moneyCur(v, productCurrency)} ${productCurrency}`;
  };
  const mainMoneyC = (som: string | number) => {
    if (!reportRate) return moneyC(som);
    const v = Number(som) / reportRate;
    const compact = Number(v).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
    const s = CUR_SYMBOL[productCurrency];
    return s ? `${s}${compact}` : `${compact} ${productCurrency}`;
  };
  const [preset, setPreset] = useState<Preset>("last30");
  const [range, setRange] = useState<[Date | null, Date | null]>(rangeFor("last30"));
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [breakdown, setBreakdown] = useState<PaymentBreakdown[]>([]);
  const [currencyBreakdown, setCurrencyBreakdown] = useState<CurrencyBreakdown[]>([]);
  const [debt, setDebt] = useState<DebtReport | null>(null);

  const query = useMemo(() => {
    const [from, to] = range;
    return {
      date_from: from ? dayjs(from).format("YYYY-MM-DD") : undefined,
      // half-open window: backend treats date_to as exclusive day boundary
      date_to: to ? dayjs(to).add(1, "day").format("YYYY-MM-DD") : undefined,
    };
  }, [range]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [s, ts, tp, pb, cb, db] = await Promise.all([
          api<Summary>("/analytics/summary", { query }),
          api<TimeseriesPoint[]>("/analytics/timeseries", { query }),
          api<TopProduct[]>("/analytics/top-products", { query }),
          api<PaymentBreakdown[]>("/analytics/payment-breakdown", { query }),
          api<CurrencyBreakdown[]>("/analytics/currency-breakdown", { query }),
          api<DebtReport>("/analytics/debt", { query }),
        ]);
        if (!alive) return;
        setSummary(s);
        setSeries(ts);
        setProducts(tp);
        setBreakdown(pb);
        setCurrencyBreakdown(cb);
        setDebt(db);
      } catch (e) {
        notifyError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query]);

  const setPresetRange = (p: Preset) => {
    setPreset(p);
    setRange(rangeFor(p));
  };

  // chart values converted to the main currency (or left in so'm if no rate)
  const fx = reportRate ? 1 / reportRate : 1;
  const areaData = series.map((p) => ({
    day: dayjs(p.day).format("DD/MM"),
    [t("revenue")]: Number(p.revenue) * fx,
    [t("profit")]: Number(p.profit) * fx,
  }));
  const axisFmt = (v: number) => {
    const compact = Number(v).toLocaleString(reportRate ? "en-US" : undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    if (!reportRate) return moneyC(v);
    const s = CUR_SYMBOL[productCurrency];
    return s ? `${s}${compact}` : `${compact} ${productCurrency}`;
  };

  // one segment per payment type, totalled in base so'm (currencies have their
  // own separate breakdown card)
  const donutData = breakdown.map((b, i) => ({
    name: payName(b.name),
    value: Number(b.total),
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  // group the per-(currency, method) rows by currency, split into Cash / Card /
  // Other for the cashier's end-of-day reconciliation in the "By currency" card
  const currencyGroups = (() => {
    const m = new Map<
      string,
      {
        code: string;
        cash: number;
        card: number;
        others: { name: string; total: number }[];
        base: number;
      }
    >();
    for (const r of currencyBreakdown) {
      if (!m.has(r.currency_code)) {
        m.set(r.currency_code, { code: r.currency_code, cash: 0, card: 0, others: [], base: 0 });
      }
      const g = m.get(r.currency_code)!;
      const nm = r.name.trim().toLowerCase();
      const amt = Number(r.total);
      if (nm === "cash") g.cash += amt;
      else if (nm === "card") g.card += amt;
      else g.others.push({ name: r.name, total: amt });
      g.base += Number(r.total_base);
    }
    return [...m.values()];
  })();

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: t("today") },
    { key: "last7", label: t("last7") },
    { key: "last30", label: t("last30") },
    { key: "month", label: t("this_month") },
  ];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Group gap="sm" align="center" wrap="nowrap">
          <Title order={2}>{t("analytics")}</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => navigate("/orders", { state: { newOrder: true } })}
          >
            {t("new_order")}
          </Button>
        </Group>
        <Group gap="xs" wrap="wrap">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="xs"
              variant={preset === p.key ? "filled" : "default"}
              onClick={() => setPresetRange(p.key)}
            >
              {p.label}
            </Button>
          ))}
          <DatePickerInput
            type="range"
            size="xs"
            valueFormat="DD/MM/YY"
            value={range}
            onChange={(v) => {
              setPreset("today");
              setRange(v);
            }}
            w={rem(220)}
            clearable={false}
          />
        </Group>
      </Group>

      {loading && !summary ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
            <Kpi label={t("revenue")} value={mainMoney(summary?.revenue ?? 0)} color="teal" />
            <Kpi label={t("profit")} value={mainMoney(summary?.profit ?? 0)} />
            <Kpi label={t("net_profit")} value={mainMoney(summary?.net_profit ?? 0)} color="amore" />
            <Kpi label={t("expenses")} value={mainMoney(summary?.expenses ?? 0)} color="red" />
            <Kpi label={t("orders")} value={num(summary?.order_count ?? 0)} sub={`${num(summary?.items_sold ?? 0)} · ${t("items_sold")}`} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Kpi
              label={t("outstanding_debt")}
              value={mainMoney(debt?.outstanding_debt ?? 0)}
              color="red"
            />
            <Kpi label={t("debt_issued")} value={mainMoney(debt?.debt_issued ?? 0)} />
            <Kpi label={t("payments_collected")} value={mainMoney(debt?.payments_collected ?? 0)} color="teal" />
            <Kpi
              label={t("deliveries_outstanding")}
              value={mainMoney(debt?.delivery_outstanding ?? 0)}
              color="orange"
            />
          </SimpleGrid>

          <Card withBorder radius="md" padding="md">
            <Text fw={600} mb="md">
              {t("revenue_profit")}
            </Text>
            {areaData.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {t("no_sales")}
              </Text>
            ) : (
              <AreaChart
                h={280}
                data={areaData}
                dataKey="day"
                withLegend
                curveType="monotone"
                valueFormatter={(v) => axisFmt(v)}
                series={[
                  { name: t("revenue"), color: "teal.6" },
                  { name: t("profit"), color: "amore.6" },
                ]}
              />
            )}
          </Card>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
            <Card withBorder radius="md" padding="md">
              <Text fw={600} mb="md">
                {t("by_payment")}
              </Text>
              {donutData.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {t("no_sales")}
                </Text>
              ) : (
                <Stack gap="sm">
                  <Center>
                    <DonutChart
                      h={220}
                      data={donutData}
                      withLabelsLine
                      withTooltip
                      tooltipDataSource="segment"
                      chartLabel={mainMoneyC(donutData.reduce((a, b) => a + b.value, 0))}
                      valueFormatter={(v) => mainMoney(v)}
                    />
                  </Center>
                  {(() => {
                    const tot = donutData.reduce((a, b) => a + b.value, 0) || 1;
                    return (
                      <Stack gap={4}>
                        {donutData.map((d) => (
                          <Group key={d.name} justify="space-between" gap="xs" wrap="nowrap">
                            <Group gap={6} wrap="nowrap">
                              <ColorSwatch
                                color={`var(--mantine-color-${d.color.replace(".", "-")})`}
                                size={10}
                              />
                              <Text size="sm">{d.name}</Text>
                            </Group>
                            <Group gap="xs" wrap="nowrap">
                              <Text size="sm" fw={600}>
                                {((d.value / tot) * 100).toFixed(1)}%
                              </Text>
                              <Text size="xs" c="dimmed" className="money-num">
                                {mainMoneyC(d.value)}
                              </Text>
                            </Group>
                          </Group>
                        ))}
                      </Stack>
                    );
                  })()}
                </Stack>
              )}
            </Card>

            <Card withBorder radius="md" padding="md">
              <Text fw={600} mb="md">
                {t("top_products")}
              </Text>
              {products.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {t("no_sales")}
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={360}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("product")}</Table.Th>
                        <Table.Th ta="right">{t("qty")}</Table.Th>
                        <Table.Th ta="right">{t("revenue")}</Table.Th>
                        <Table.Th ta="right">{t("profit")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {products.map((p) => (
                        <Table.Tr key={p.product_id}>
                          <Table.Td>{p.name}</Table.Td>
                          <Table.Td ta="right" className="money-num">
                            {num(p.quantity)}
                          </Table.Td>
                          <Table.Td ta="right" className="money-num" c="teal">
                            {mainMoneyC(p.revenue)}
                          </Table.Td>
                          <Table.Td ta="right" className="money-num">
                            {mainMoneyC(p.profit)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>

            <Card withBorder radius="md" padding="md">
              <Text fw={600} mb="md">
                {t("cashier_reconciliation")}
              </Text>
              {currencyGroups.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                  {t("no_sales")}
                </Text>
              ) : (
                <Stack gap="md">
                  {currencyGroups.map((g) => (
                    <div key={g.code}>
                      <Group justify="space-between" mb={4} wrap="nowrap">
                        <Badge variant="light">{g.code}</Badge>
                        <Text size="xs" c="dimmed" className="money-num">
                          ≈ {mainMoneyC(g.base)}
                        </Text>
                      </Group>
                      <Stack gap={4} pl="sm">
                        <Group justify="space-between" gap="xs" wrap="nowrap">
                          <Text size="sm" fw={600}>
                            💵 {t("pt_cash")}
                          </Text>
                          <Text size="sm" fw={600} className="money-num">
                            {moneyCur(g.cash, g.code)} {g.code}
                          </Text>
                        </Group>
                        <Group justify="space-between" gap="xs" wrap="nowrap">
                          <Text size="sm" fw={600}>
                            💳 {t("pt_card")}
                          </Text>
                          <Text size="sm" fw={600} className="money-num">
                            {moneyCur(g.card, g.code)} {g.code}
                          </Text>
                        </Group>
                        {g.others.map((o) => (
                          <Group key={o.name} justify="space-between" gap="xs" wrap="nowrap">
                            <Text size="sm" c="dimmed">
                              {payName(o.name)}
                            </Text>
                            <Text size="sm" c="dimmed" className="money-num">
                              {moneyCur(o.total, g.code)} {g.code}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    </div>
                  ))}
                </Stack>
              )}
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
            <Card withBorder radius="md" padding="md">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>{t("outstanding_debt")}</Text>
                <Badge color="red" variant="light">
                  {mainMoney(debt?.outstanding_debt ?? 0)}
                </Badge>
              </Group>
              {!debt?.debtors.length ? (
                <Text c="dimmed" ta="center" py="lg">
                  {t("no_debt")}
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={320}>
                  <Table striped>
                    <Table.Tbody>
                      {debt.debtors.map((d) => (
                        <Table.Tr key={d.client_id}>
                          <Table.Td>{d.name}</Table.Td>
                          <Table.Td c="dimmed">{d.phone_number}</Table.Td>
                          <Table.Td ta="right" c="red" className="money-num">
                            {mainMoney(d.debt)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>

            <Card withBorder radius="md" padding="md">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>{t("deliveries_outstanding")}</Text>
                <Badge color="orange" variant="light">
                  {mainMoney(debt?.delivery_outstanding ?? 0)}
                </Badge>
              </Group>
              {!debt?.deliveries.length ? (
                <Text c="dimmed" ta="center" py="lg">
                  —
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={320}>
                  <Table striped>
                    <Table.Tbody>
                      {debt.deliveries.map((d) => (
                        <Table.Tr key={d.order_id}>
                          <Table.Td>#{d.order_id}</Table.Td>
                          <Table.Td>{d.client_name}</Table.Td>
                          <Table.Td c="dimmed">{d.due_date ? fmtDate(d.due_date) : "—"}</Table.Td>
                          <Table.Td ta="right" className="money-num">
                            {mainMoney(d.total)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
