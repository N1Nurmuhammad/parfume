import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  PasswordInput,
  Switch,
  Table,
  Text,
  TextInput,
  ActionIcon,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "../api/client";
import type { Admin } from "../api/types";
import { useList } from "../lib/useList";
import { useT } from "../i18n";
import { notifyError, notifySuccess } from "../lib/notify";
import { confirmKey } from "../lib/confirm";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../auth/AuthContext";

export function Admins() {
  const t = useT();
  const { me } = useAuth();
  const { data, reload } = useList<Admin>("/admins");

  const [opened, setOpened] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setLogin("");
    setPassword("");
    setIsSuperuser(false);
    setOpened(true);
  };

  const closeModal = () => setOpened(false);

  const handleDelete = async (a: Admin) => {
    if (!confirmKey("del_admin")) return;
    try {
      await api(`/admins/${a.id}`, { method: "DELETE" });
      await reload();
      notifySuccess(t("saved"));
    } catch (e) {
      notifyError(e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/admins", {
        method: "POST",
        body: { login, password, is_superuser: isSuperuser },
      });
      await reload();
      notifySuccess(t("saved"));
      closeModal();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("nav_admins")}>
        <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
          {t("add_admin")}
        </Button>
      </PageHeader>

      <Card withBorder p={0}>
        <Table.ScrollContainer minWidth={480}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("login")}</Table.Th>
                <Table.Th>{t("superuser")}</Table.Th>
                <Table.Th>{t("actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    {a.login}
                    {a.id === me?.id ? (
                      <Badge ml="xs" variant="light">
                        {t("you")}
                      </Badge>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    {a.is_superuser ? (
                      <Badge color="amore">★</Badge>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {a.id === me?.id ? null : (
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => handleDelete(a)}
                        aria-label={t("actions")}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <Modal opened={opened} onClose={closeModal} title={t("add_admin")} centered>
        <TextInput
          label={t("login")}
          required
          value={login}
          onChange={(e) => setLogin(e.currentTarget.value)}
          mb="sm"
        />
        <PasswordInput
          label={t("password")}
          required
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          mb="sm"
        />
        <Switch
          label={t("sup_hint")}
          checked={isSuperuser}
          onChange={(e) => setIsSuperuser(e.currentTarget.checked)}
          mb="md"
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={closeModal}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t("save")}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
