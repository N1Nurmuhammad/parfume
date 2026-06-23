import { useEffect, useMemo, useState } from "react";
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
  Textarea,
  TextInput,
  NumberInput,
  SegmentedControl,
  MultiSelect,
  Drawer,
  Tooltip,
  Divider,
} from "@mantine/core";
import { DateInput, DateTimePicker } from "@mantine/dates";
import {
  IconPlus,
  IconPencil,
  IconSend,
  IconX,
  IconEye,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { api } from "../api/client";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { fmtDateTime, num } from "../lib/money";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";
import type {
  SmsBroadcast,
  SmsMessage,
  SmsAudience,
  SmsScheduleKind,
} from "../api/types";

const PLACEHOLDERS = ["{name}", "{debt}", "{balance}"];

const STATUS_COLOR: Record<string, string> = {
  scheduled: "blue",
  sending: "yellow",
  done: "teal",
  failed: "red",
  canceled: "gray",
};

type Freq = "daily" | "weekly" | "monthly" | "custom";

export function Sms() {
  const t = useT();
  const { data, loading, reload } = useList<SmsBroadcast>("/sms");
  const [editing, setEditing] = useState<SmsBroadcast | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<SmsBroadcast | null>(null);

  const audLabel = (a: SmsAudience) => t("aud_" + a);

  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      notifySuccess(t("saved"));
      reload();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Stack gap="md">
      <PageHeader title={t("nav_sms")}>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          {t("new_broadcast")}
        </Button>
      </PageHeader>

      <Card withBorder p={0} radius="md">
        <Table.ScrollContainer minWidth={820}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("message")}</Table.Th>
                <Table.Th>{t("audience")}</Table.Th>
                <Table.Th>{t("schedule")}</Table.Th>
                <Table.Th>{t("status")}</Table.Th>
                <Table.Th>{t("sent")}</Table.Th>
                <Table.Th ta="right">{t("actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td maw={260}>
                    <Text lineClamp={2} size="sm">
                      {b.message}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{audLabel(b.audience)}</Badge>
                    <Text size="xs" c="dimmed">
                      {num(b.recipients_count)} · {t("recipients")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {b.schedule_kind === "cron" ? (
                      <Text size="xs" ff="monospace">
                        {b.cron}
                      </Text>
                    ) : (
                      <Text size="xs">{fmtDateTime(b.scheduled_at)}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[b.status] ?? "gray"} variant="light">
                      {t("st_" + b.status)}
                    </Badge>
                  </Table.Td>
                  <Table.Td c="dimmed">
                    {num(b.sent_count)}
                    {b.failed_count > 0 && (
                      <Text span c="red">
                        {" "}
                        / {num(b.failed_count)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {b.status === "scheduled" && (
                        <>
                          <Tooltip label={t("edit")}>
                            <ActionIcon variant="subtle" onClick={() => setEditing(b)}>
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("send_now")}>
                            <ActionIcon
                              variant="subtle"
                              color="teal"
                              onClick={() => action(() => api(`/sms/${b.id}/send-now`, { method: "POST" }))}
                            >
                              <IconSend size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t("cancel")}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() =>
                                confirmKey("cancel_bc") &&
                                action(() => api(`/sms/${b.id}/cancel`, { method: "POST" }))
                              }
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip label={t("view")}>
                        <ActionIcon variant="subtle" onClick={() => setViewing(b)}>
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!loading && data.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {t("no_broadcasts")}
          </Text>
        )}
      </Card>

      {(creating || editing) && (
        <BroadcastModal
          broadcast={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}

      <MessagesDrawer broadcast={viewing} onClose={() => setViewing(null)} />
    </Stack>
  );
}

// ───────────────────────── broadcast builder ─────────────────────────

function buildCron(freq: Freq, time: string, weekdays: string[], dom: number, raw: string): string {
  const [h, m] = time.split(":");
  const hh = h ?? "9";
  const mm = m ?? "0";
  if (freq === "daily") return `${mm} ${hh} * * *`;
  if (freq === "weekly") return `${mm} ${hh} * * ${(weekdays.length ? weekdays : ["1"]).join(",")}`;
  if (freq === "monthly") return `${mm} ${hh} ${dom || 1} * *`;
  return raw;
}

function BroadcastModal({
  broadcast,
  onClose,
  onSaved,
}: {
  broadcast: SmsBroadcast | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEdit = !!broadcast;

  const [message, setMessage] = useState(broadcast?.message ?? "");
  const [audience, setAudience] = useState<SmsAudience>(broadcast?.audience ?? "all");
  const [customNumbers, setCustomNumbers] = useState(broadcast?.custom_numbers ?? "");
  const [kind, setKind] = useState<SmsScheduleKind>(broadcast?.schedule_kind ?? "once");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(
    broadcast?.scheduled_at ? new Date(broadcast.scheduled_at) : null,
  );
  // cron builder state — existing crons open in "custom" mode with the raw value
  const [freq, setFreq] = useState<Freq>(broadcast?.cron ? "custom" : "daily");
  const [time, setTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState<string[]>(["1"]);
  const [dom, setDom] = useState<number>(1);
  const [rawCron, setRawCron] = useState(broadcast?.cron ?? "0 9 * * *");
  const [endsAt, setEndsAt] = useState<Date | null>(
    broadcast?.ends_at ? new Date(broadcast.ends_at) : null,
  );
  const [maxRuns, setMaxRuns] = useState<string | number>(broadcast?.max_runs ?? "");
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(broadcast?.recipients_count ?? null);

  const weekdayData = useMemo(
    () => [
      { value: "1", label: t("wd_mon") },
      { value: "2", label: t("wd_tue") },
      { value: "3", label: t("wd_wed") },
      { value: "4", label: t("wd_thu") },
      { value: "5", label: t("wd_fri") },
      { value: "6", label: t("wd_sat") },
      { value: "0", label: t("wd_sun") },
    ],
    [t],
  );

  // live recipient count
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      api<{ count: number }>("/sms/audience-count", {
        query: { audience, custom_numbers: audience === "custom" ? customNumbers : undefined },
      })
        .then((r) => alive && setRecipients(r.count))
        .catch(() => alive && setRecipients(null));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [audience, customNumbers]);

  const insert = (ph: string) => setMessage((m) => m + ph);

  const submit = async () => {
    if (!message.trim()) return notifyError(new Error(t("need_message")));
    if (kind === "once" && !scheduledAt) return notifyError(new Error(t("need_schedule")));

    const cron = kind === "cron" ? buildCron(freq, time, weekdays, dom, rawCron) : null;
    const body = {
      message,
      audience,
      custom_numbers: audience === "custom" ? customNumbers : null,
      schedule_kind: kind,
      scheduled_at: kind === "once" && scheduledAt ? dayjs(scheduledAt).format("YYYY-MM-DDTHH:mm:ss") : null,
      cron,
      starts_at: null,
      ends_at: endsAt ? dayjs(endsAt).format("YYYY-MM-DDTHH:mm:ss") : null,
      max_runs: maxRuns ? Number(maxRuns) : null,
    };

    setBusy(true);
    try {
      if (isEdit && broadcast) await api(`/sms/${broadcast.id}`, { method: "PUT", body });
      else await api("/sms", { method: "POST", body });
      notifySuccess(t("saved"));
      onSaved();
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={isEdit ? t("edit") : t("new_broadcast")} size="lg" centered>
      <Stack>
        <div>
          <Textarea
            label={t("message")}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            autosize
            minRows={3}
          />
          <Group gap={4} mt={6}>
            <Text size="xs" c="dimmed">
              {t("insert")}:
            </Text>
            {PLACEHOLDERS.map((p) => (
              <Badge
                key={p}
                variant="outline"
                style={{ cursor: "pointer" }}
                onClick={() => insert(p)}
              >
                {p}
              </Badge>
            ))}
          </Group>
        </div>

        <Group grow align="flex-start">
          <Select
            label={t("audience")}
            value={audience}
            onChange={(v) => setAudience((v as SmsAudience) ?? "all")}
            data={[
              { value: "all", label: t("aud_all") },
              { value: "debtors", label: t("aud_debtors") },
              { value: "birthdays", label: t("aud_birthdays") },
              { value: "custom", label: t("aud_custom") },
            ]}
          />
          <TextInput
            label={t("recipients")}
            value={recipients == null ? "—" : num(recipients)}
            readOnly
          />
        </Group>

        {audience === "custom" && (
          <Textarea
            label={t("custom_numbers")}
            value={customNumbers}
            onChange={(e) => setCustomNumbers(e.currentTarget.value)}
            autosize
            minRows={2}
          />
        )}

        <Divider label={t("schedule")} labelPosition="left" />
        <SegmentedControl
          fullWidth
          value={kind}
          onChange={(v) => setKind(v as SmsScheduleKind)}
          data={[
            { value: "once", label: t("sched_once") },
            { value: "cron", label: t("sched_recurring") },
          ]}
        />

        {kind === "once" ? (
          <DateTimePicker
            label={t("at_time")}
            value={scheduledAt}
            onChange={(d) => setScheduledAt(d ? new Date(d) : null)}
            valueFormat="DD/MM/YYYY HH:mm"
          />
        ) : (
          <Stack gap="xs">
            <Group grow>
              <Select
                label={t("freq")}
                value={freq}
                onChange={(v) => setFreq((v as Freq) ?? "daily")}
                data={[
                  { value: "daily", label: t("daily") },
                  { value: "weekly", label: t("weekly") },
                  { value: "monthly", label: t("monthly") },
                  { value: "custom", label: t("custom_cron") },
                ]}
              />
              {freq !== "custom" && (
                <TextInput
                  label={t("at_time")}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.currentTarget.value)}
                />
              )}
            </Group>
            {freq === "weekly" && (
              <MultiSelect
                label={t("on_days")}
                value={weekdays}
                onChange={setWeekdays}
                data={weekdayData}
              />
            )}
            {freq === "monthly" && (
              <NumberInput label={t("day_of_month")} value={dom} onChange={(v) => setDom(Number(v) || 1)} min={1} max={31} />
            )}
            {freq === "custom" && (
              <TextInput
                label={t("cron_expr")}
                value={rawCron}
                onChange={(e) => setRawCron(e.currentTarget.value)}
                placeholder="0 9 * * *"
                styles={{ input: { fontFamily: "monospace" } }}
              />
            )}
            <Group grow>
              <DateInput label={t("ends_at")} value={endsAt} onChange={(d) => setEndsAt(d ? new Date(d) : null)} clearable valueFormat="DD/MM/YYYY" />
              <NumberInput label={t("max_runs")} value={maxRuns} onChange={setMaxRuns} min={1} />
            </Group>
          </Stack>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} loading={busy}>
            {isEdit ? t("save_changes") : t("create_broadcast")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ───────────────────────── delivery log drawer ─────────────────────────

function MessagesDrawer({ broadcast, onClose }: { broadcast: SmsBroadcast | null; onClose: () => void }) {
  const t = useT();
  const [msgs, setMsgs] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!broadcast) return;
    setLoading(true);
    api<SmsMessage[]>(`/sms/${broadcast.id}/messages`)
      .then(setMsgs)
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [broadcast]);

  return (
    <Drawer opened={!!broadcast} onClose={onClose} position="right" size="md" title={t("delivery_log")}>
      {!loading && msgs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          {t("no_messages")}
        </Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {msgs.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.phone}</Table.Td>
                <Table.Td>
                  <Badge color={m.status === "sent" ? "teal" : "red"} variant="light">
                    {m.status === "sent" ? t("sent") : t("st_failed")}
                  </Badge>
                </Table.Td>
                <Table.Td c="dimmed" fz="xs">
                  {m.error || fmtDateTime(m.created_at)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Drawer>
  );
}
