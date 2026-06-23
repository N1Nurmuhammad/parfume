import { useState } from "react";
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Stack,
  Center,
  Box,
  Group,
  SegmentedControl,
} from "@mantine/core";
import { useAuth } from "../auth/AuthContext";
import { useI18n, LANGS, type Lang } from "../i18n";
import { ApiError } from "../api/client";

export function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(user, pass);
    } catch (ex) {
      setErr(ex instanceof ApiError && ex.status === 401 ? t("invalid_creds") : (ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" style={{ background: "var(--mantine-color-body)" }}>
      <Box w="100%" maw={400}>
        <Group justify="flex-end" mb="sm">
          <SegmentedControl
            size="xs"
            value={lang}
            onChange={(v) => setLang(v as Lang)}
            data={LANGS.map((l) => ({ value: l.value, label: l.label }))}
          />
        </Group>
        <Paper withBorder shadow="md" p="xl" radius="lg">
          <form onSubmit={submit}>
            <Stack>
              <div>
                <Title order={3}>
                  Amore Here <Text span c="amore" inherit>Sulwhasoo</Text>
                </Title>
                <Text c="dimmed" size="sm">
                  {t("login_sub")}
                </Text>
              </div>
              <TextInput
                label={t("login")}
                value={user}
                onChange={(e) => setUser(e.currentTarget.value)}
                autoFocus
                required
              />
              <PasswordInput
                label={t("password")}
                value={pass}
                onChange={(e) => setPass(e.currentTarget.value)}
                required
              />
              {err && (
                <Text c="red" size="sm">
                  {err}
                </Text>
              )}
              <Button type="submit" loading={busy} fullWidth>
                {t("sign_in")}
              </Button>
            </Stack>
          </form>
        </Paper>
      </Box>
    </Center>
  );
}
