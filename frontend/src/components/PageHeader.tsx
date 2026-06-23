import { Group, Title } from "@mantine/core";
import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
      <Title order={2}>{title}</Title>
      <Group gap="sm">{children}</Group>
    </Group>
  );
}
