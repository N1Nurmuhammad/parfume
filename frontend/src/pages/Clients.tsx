import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconGift,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { BalanceLog, CashbackLog, Client } from '../api/types';
import { useList } from '../lib/useList';
import { useT } from '../i18n';
import { fmtDate, fmtDateTime, money } from '../lib/money';
import { formatUzPhone, isValidUzPhone, maskUzPhone } from '../lib/phone';
import { MoneyInput } from '../components/MoneyInput';
import { notifyError, notifySuccess } from '../lib/notify';
import { confirmKey } from '../lib/confirm';
import { PageHeader } from '../components/PageHeader';

interface FormState {
  name: string;
  phone: string;
  birth_date: Date | null;
}

const emptyForm: FormState = { name: '', phone: '+998 ', birth_date: null };

export function Clients() {
  const t = useT();
  const { data, loading, reload } = useList<Client>('/clients');

  const [search, setSearch] = useState('');

  // Add / edit modal -------------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const editing = editingId !== null;

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  function openEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone_number,
      birth_date: c.birth_date ? new Date(c.birth_date) : null,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !phone) {
      notifyError(new Error(t('name_phone_required')));
      return;
    }
    const normalizedPhone = formatUzPhone(phone);
    if (!normalizedPhone) {
      notifyError(new Error(t('invalid_phone')));
      return;
    }
    const body = {
      name,
      phone_number: normalizedPhone,
      birth_date: form.birth_date ? dayjs(form.birth_date).format('YYYY-MM-DD') : null,
    };
    try {
      if (editing && editingId !== null) {
        await api(`/clients/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/clients', { method: 'POST', body });
      }
      await reload();
      notifySuccess(t('saved'));
      setModalOpen(false);
    } catch (e) {
      notifyError(e);
    }
  }

  async function handleDelete(c: Client) {
    if (!confirmKey('del_client')) return;
    try {
      await api(`/clients/${c.id}`, { method: 'DELETE' });
      await reload();
      notifySuccess(t('saved'));
    } catch (e) {
      notifyError(e);
    }
  }

  // Balance / cashback drawers --------------------------------------------
  const [balanceClient, setBalanceClient] = useState<Client | null>(null);
  const [cashbackClient, setCashbackClient] = useState<Client | null>(null);

  // Keep the selected client object fresh after a reload.
  const liveBalanceClient = useMemo(
    () => (balanceClient ? data.find((c) => c.id === balanceClient.id) ?? balanceClient : null),
    [balanceClient, data],
  );
  const liveCashbackClient = useMemo(
    () => (cashbackClient ? data.find((c) => c.id === cashbackClient.id) ?? cashbackClient : null),
    [cashbackClient, data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone_number.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <>
      <PageHeader title={t('nav_clients')}>
        <TextInput
          placeholder={t('search')}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
          {t('add_client')}
        </Button>
      </PageHeader>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('name')}</Table.Th>
                <Table.Th>{t('phone')}</Table.Th>
                <Table.Th>{t('birth_date')}</Table.Th>
                <Table.Th ta="right">{t('balance')}</Table.Th>
                <Table.Th ta="right">{t('cashback')}</Table.Th>
                <Table.Th>{t('actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.name}</Table.Td>
                  <Table.Td>{c.phone_number}</Table.Td>
                  <Table.Td>{fmtDate(c.birth_date)}</Table.Td>
                  <Table.Td ta="right">
                    {Number(c.balance) < 0 ? (
                      <Text c="red">{money(c.balance)}</Text>
                    ) : (
                      money(c.balance)
                    )}
                  </Table.Td>
                  <Table.Td ta="right">{money(c.cashback)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setBalanceClient(c)}
                        aria-label={t('balance')}
                      >
                        <IconWallet size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setCashbackClient(c)}
                        aria-label={t('cashback')}
                      >
                        <IconGift size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => openEdit(c)}
                        aria-label={t('edit')}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDelete(c)}
                        aria-label={t('delete')}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {!loading && filtered.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {t('no_clients')}
          </Text>
        )}
      </Card>

      {/* Add / edit modal */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('edit') : t('add_client')}
      >
        <Stack>
          <TextInput
            label={t('name')}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
          <TextInput
            label={t('phone')}
            required
            placeholder="+998 90 123 45 67"
            inputMode="tel"
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, phone: maskUzPhone(e.currentTarget.value) }))
            }
            error={
              form.phone.trim() && !isValidUzPhone(form.phone)
                ? t('invalid_phone')
                : undefined
            }
          />
          <DateInput
            label={t('birth_date')}
            clearable
            valueFormat="YYYY-MM-DD"
            value={form.birth_date}
            onChange={(d) =>
              setForm((f) => ({ ...f, birth_date: d ? new Date(d) : null }))
            }
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave}>{t('save')}</Button>
          </Group>
        </Stack>
      </Modal>

      <BalanceDrawer
        client={liveBalanceClient}
        onClose={() => setBalanceClient(null)}
        onRecorded={reload}
      />
      <CashbackDrawer
        client={liveCashbackClient}
        onClose={() => setCashbackClient(null)}
        onRecorded={reload}
      />
    </>
  );
}

// ===========================================================================
// Balance drawer
// ===========================================================================

function BalanceDrawer({
  client,
  onClose,
  onRecorded,
}: {
  client: Client | null;
  onClose: () => void;
  onRecorded: () => Promise<void> | void;
}) {
  const t = useT();
  const [change, setChange] = useState('');
  const [reason, setReason] = useState('payment');
  const [note, setNote] = useState('');
  const [logs, setLogs] = useState<BalanceLog[]>([]);
  const [saving, setSaving] = useState(false);

  const clientId = client?.id ?? null;

  async function loadLogs(id: number) {
    try {
      const res = await api<BalanceLog[]>(`/clients/${id}/balance-logs`);
      setLogs(res);
    } catch (e) {
      notifyError(e);
    }
  }

  useEffect(() => {
    if (clientId === null) return;
    setChange('');
    setReason('payment');
    setNote('');
    loadLogs(clientId);
  }, [clientId]);

  async function record() {
    if (clientId === null) return;
    setSaving(true);
    try {
      await api(`/clients/${clientId}/balance`, {
        method: 'POST',
        body: { change: change || '0', reason, note: note || null },
      });
      await onRecorded();
      await loadLogs(clientId);
      setChange('');
      setNote('');
      notifySuccess(t('saved'));
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      opened={client !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={t('balance_history')}
    >
      {client && (
        <Stack>
          <div>
            <Text fw={600}>{client.name}</Text>
            <Text size="sm" c="dimmed">
              {t('current_balance')}
            </Text>
            <Title order={2} c={Number(client.balance) < 0 ? 'red' : undefined}>
              {money(client.balance)}
            </Title>
          </div>

          <Divider />

          <MoneyInput
            label={t('amount_hint')}
            allowNegative
            value={change}
            onChange={setChange}
          />
          <Select
            label={t('reason')}
            value={reason}
            onChange={(v) => setReason(v ?? 'payment')}
            data={[
              { value: 'payment', label: t('payment') },
              { value: 'adjustment', label: t('adjustment') },
            ]}
          />
          <TextInput
            placeholder={t('optional')}
            label={t('note')}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Button onClick={record} loading={saving}>
            {t('record_entry')}
          </Button>

          <Divider />

          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('when')}</Table.Th>
                  <Table.Th ta="right">{t('change')}</Table.Th>
                  <Table.Th ta="right">{t('after')}</Table.Th>
                  <Table.Th>{t('reason')}</Table.Th>
                  <Table.Th>{t('note')}</Table.Th>
                  <Table.Th>{t('by')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>{fmtDateTime(l.created_at)}</Table.Td>
                    <Table.Td ta="right">
                      <Text c={Number(l.change) < 0 ? 'red' : 'green'}>
                        {money(l.change)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{money(l.balance_after)}</Table.Td>
                    <Table.Td>{l.reason}</Table.Td>
                    <Table.Td>{l.note ?? '—'}</Table.Td>
                    <Table.Td>{l.admin_login}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {logs.length === 0 && (
            <Text c="dimmed" ta="center" py="md">
              {t('no_activity')}
            </Text>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

// ===========================================================================
// Cashback drawer
// ===========================================================================

function CashbackDrawer({
  client,
  onClose,
  onRecorded,
}: {
  client: Client | null;
  onClose: () => void;
  onRecorded: () => Promise<void> | void;
}) {
  const t = useT();
  const [change, setChange] = useState('');
  const [note, setNote] = useState('');
  const [logs, setLogs] = useState<CashbackLog[]>([]);
  const [saving, setSaving] = useState(false);

  const clientId = client?.id ?? null;

  async function loadLogs(id: number) {
    try {
      const res = await api<CashbackLog[]>(`/clients/${id}/cashback-logs`);
      setLogs(res);
    } catch (e) {
      notifyError(e);
    }
  }

  useEffect(() => {
    if (clientId === null) return;
    setChange('');
    setNote('');
    loadLogs(clientId);
  }, [clientId]);

  async function record() {
    if (clientId === null) return;
    setSaving(true);
    try {
      await api(`/clients/${clientId}/cashback`, {
        method: 'POST',
        body: { change: change || '0', note: note || null },
      });
      await onRecorded();
      await loadLogs(clientId);
      setChange('');
      setNote('');
      notifySuccess(t('saved'));
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      opened={client !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={t('cashback_history')}
    >
      {client && (
        <Stack>
          <div>
            <Text fw={600}>{client.name}</Text>
            <Text size="sm" c="dimmed">
              {t('current_cashback')}
            </Text>
            <Title order={2}>{money(client.cashback)}</Title>
          </div>

          <Divider />

          <MoneyInput
            label={t('cashback_amount_hint')}
            allowNegative
            value={change}
            onChange={setChange}
          />
          <TextInput
            placeholder={t('optional')}
            label={t('note')}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Button onClick={record} loading={saving}>
            {t('record_entry')}
          </Button>

          <Divider />

          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('when')}</Table.Th>
                  <Table.Th ta="right">{t('change')}</Table.Th>
                  <Table.Th ta="right">{t('after')}</Table.Th>
                  <Table.Th>{t('reason')}</Table.Th>
                  <Table.Th>{t('note')}</Table.Th>
                  <Table.Th>{t('by')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td>{fmtDateTime(l.created_at)}</Table.Td>
                    <Table.Td ta="right">
                      <Text c={Number(l.change) < 0 ? 'red' : 'green'}>
                        {money(l.change)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{money(l.cashback_after)}</Table.Td>
                    <Table.Td>{l.reason}</Table.Td>
                    <Table.Td>{l.note ?? '—'}</Table.Td>
                    <Table.Td>{l.admin_login}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {logs.length === 0 && (
            <Text c="dimmed" ta="center" py="md">
              {t('no_activity')}
            </Text>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
