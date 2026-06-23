import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { api } from '../api/client';
import type { Product } from '../api/types';
import { useList } from '../lib/useList';
import { useT } from '../i18n';
import { moneyCur } from '../lib/money';
import { MoneyInput } from '../components/MoneyInput';
import { notifyError, notifySuccess } from '../lib/notify';
import { confirmKey } from '../lib/confirm';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';

interface FormState {
  name: string;
  quantity: number;
  price: string;
  cargo: string;
  cargo_price: string;
}

const emptyForm: FormState = {
  name: '',
  quantity: 0,
  price: '',
  cargo: '',
  cargo_price: '',
};

export function Products() {
  const t = useT();
  const { productCurrency } = useAuth();
  const pc = productCurrency;
  const { data, loading, reload } = useList<Product>('/products');

  const [opened, setOpened] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const editing = editingId !== null;

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setOpened(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      quantity: p.quantity,
      price: p.price,
      cargo: p.cargo,
      cargo_price: p.cargo_price,
    });
    setOpened(true);
  }

  async function handleDelete(p: Product) {
    if (!confirmKey('del_product')) return;
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      await reload();
      notifySuccess(t('saved'));
    } catch (e) {
      notifyError(e);
    }
  }

  async function handleSave() {
    const body = {
      name: form.name,
      quantity: Number(form.quantity) || 0,
      price: form.price || '0',
      cargo: form.cargo || '0',
      cargo_price: form.cargo_price || '0',
    };
    try {
      if (editing && editingId !== null) {
        await api(`/products/${editingId}`, { method: 'PUT', body });
      } else {
        await api('/products', { method: 'POST', body });
      }
      await reload();
      notifySuccess(t('saved'));
      setOpened(false);
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <>
      <PageHeader title={t('nav_products')}>
        <Button onClick={openAdd}>{t('add_product')}</Button>
      </PageHeader>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={680}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('name')}</Table.Th>
                <Table.Th ta="right">{t('stock')}</Table.Th>
                <Table.Th ta="right">{`${t('price')} (${pc})`}</Table.Th>
                <Table.Th ta="right">{`${t('cargo')} (${pc})`}</Table.Th>
                <Table.Th ta="right">{`${t('full_price')} (${pc})`}</Table.Th>
                <Table.Th ta="right">{`${t('cost')} (${pc})`}</Table.Th>
                <Table.Th>{t('actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td ta="right">{p.quantity}</Table.Td>
                  <Table.Td ta="right">{moneyCur(p.price, pc)}</Table.Td>
                  <Table.Td ta="right">{moneyCur(p.cargo, pc)}</Table.Td>
                  <Table.Td ta="right">
                    <b>{moneyCur(p.full_price, pc)}</b>
                  </Table.Td>
                  <Table.Td ta="right">{moneyCur(p.cargo_price, pc)}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => openEdit(p)}
                        aria-label={t('edit')}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDelete(p)}
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

        {!loading && data.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {t('no_products')}
          </Text>
        )}
      </Card>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? t('edit') : t('add_product')}
      >
        <Stack>
          <TextInput
            label={t('name')}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
          <NumberInput
            label={t('stock')}
            min={0}
            allowNegative={false}
            value={form.quantity}
            onChange={(v) =>
              setForm((f) => ({ ...f, quantity: typeof v === 'number' ? v : Number(v) || 0 }))
            }
          />
          <MoneyInput
            label={`${t('price')} (${pc})`}
            value={form.price}
            onChange={(raw) => setForm((f) => ({ ...f, price: raw }))}
          />
          <MoneyInput
            label={`${t('cargo')} (${pc})`}
            value={form.cargo}
            onChange={(raw) => setForm((f) => ({ ...f, cargo: raw }))}
          />
          <MoneyInput
            label={`${t('cost')} (${pc})`}
            value={form.cargo_price}
            onChange={(raw) => setForm((f) => ({ ...f, cargo_price: raw }))}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave}>{t('save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
