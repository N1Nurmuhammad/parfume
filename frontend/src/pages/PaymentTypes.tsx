import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";

import { api } from "../api/client";
import type { PaymentType } from "../api/types";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";
import { payName } from "../lib/payName";

interface FormState {
  name: string;
  is_debt: boolean;
  is_cashback: boolean;
  is_change: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  is_debt: false,
  is_cashback: false,
  is_change: false,
};

export function PaymentTypes() {
  const t = useT();
  const { data, loading, reload } = useList<PaymentType>("/payment-types");

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<PaymentType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpened(true);
  }

  function openEdit(pt: PaymentType) {
    setEditing(pt);
    setForm({
      name: pt.name,
      is_debt: pt.is_debt,
      is_cashback: pt.is_cashback,
      is_change: pt.is_change,
    });
    setOpened(true);
  }

  function close() {
    setOpened(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        is_debt: form.is_debt,
        is_cashback: form.is_cashback,
        is_change: form.is_change,
      };
      if (editing) {
        await api(`/payment-types/${editing.id}`, { method: "PUT", body });
      } else {
        await api("/payment-types", { method: "POST", body });
      }
      await reload();
      notifySuccess(t("saved"));
      setOpened(false);
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pt: PaymentType) {
    if (!confirmKey("del_type")) return;
    try {
      await api(`/payment-types/${pt.id}`, { method: "DELETE" });
      await reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <>
      <PageHeader title={t("nav_payment")}>
        <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
          {t("add_type")}
        </Button>
      </PageHeader>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={520}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("payment_type")}</Table.Th>
                <Table.Th>{t("debt")}</Table.Th>
                <Table.Th>{t("cashback")}</Table.Th>
                <Table.Th>{t("change_label")}</Table.Th>
                <Table.Th>{t("actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((pt) => (
                <Table.Tr key={pt.id}>
                  <Table.Td>{payName(pt.name)}</Table.Td>
                  <Table.Td>
                    {pt.is_debt ? (
                      <Badge color="orange">{t("debt")}</Badge>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {pt.is_cashback ? (
                      <Badge color="grape">{t("cashback")}</Badge>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {pt.is_change ? (
                      <Badge color="teal">{t("change_label")}</Badge>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        onClick={() => openEdit(pt)}
                        aria-label={t("edit")}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDelete(pt)}
                        aria-label={t("delete")}
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
            {t("no_types")}
          </Text>
        )}
      </Card>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t("edit") : t("add_type")}
        centered
      >
        <Stack gap="md">
          <TextInput
            label={t("name")}
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
          />
          <Switch
            label={t("debt_type_q")}
            checked={form.is_debt}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                is_debt: e.currentTarget.checked,
                // a debt type can't also be a change type
                is_change: e.currentTarget.checked ? false : f.is_change,
              }))
            }
          />
          <Switch
            label={t("is_cashback_q")}
            checked={form.is_cashback}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                is_cashback: e.currentTarget.checked,
                is_change: e.currentTarget.checked ? false : f.is_change,
              }))
            }
          />
          <Switch
            label={t("change_type_q")}
            checked={form.is_change}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                is_change: e.currentTarget.checked,
                // a change type returns money — it can't be debt or cashback
                is_debt: e.currentTarget.checked ? false : f.is_debt,
                is_cashback: e.currentTarget.checked ? false : f.is_cashback,
              }))
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
    </>
  );
}
