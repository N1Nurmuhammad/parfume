import { lazy, Suspense, type ComponentType } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  ActionIcon,
  Button,
  Center,
  Loader,
  ScrollArea,
  Menu,
  useMantineColorScheme,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconLayoutDashboard,
  IconShoppingCart,
  IconPackage,
  IconUsers,
  IconCreditCard,
  IconCurrencyDollar,
  IconReceipt2,
  IconUserShield,
  IconMessage,
  IconSun,
  IconMoon,
  IconLogout,
  IconLanguage,
} from "@tabler/icons-react";
import { useAuth } from "./auth/AuthContext";
import { useI18n, LANGS, type Lang } from "./i18n";
import { Login } from "./pages/Login";
import { DailyRatePrompt } from "./components/DailyRatePrompt";

// Each page is code-split into its own chunk so the initial load only fetches the
// shell + the current page. The Dashboard's recharts/@mantine/charts (the heaviest
// dependency) is deferred until that tab is actually opened. Pages are named
// exports, so map them to a default for React.lazy.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Orders = lazy(() => import("./pages/Orders").then((m) => ({ default: m.Orders })));
const Products = lazy(() => import("./pages/Products").then((m) => ({ default: m.Products })));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const PaymentTypes = lazy(() =>
  import("./pages/PaymentTypes").then((m) => ({ default: m.PaymentTypes })),
);
const Currencies = lazy(() =>
  import("./pages/Currencies").then((m) => ({ default: m.Currencies })),
);
const Expenses = lazy(() => import("./pages/Expenses").then((m) => ({ default: m.Expenses })));
const Admins = lazy(() => import("./pages/Admins").then((m) => ({ default: m.Admins })));
const Sms = lazy(() => import("./pages/Sms").then((m) => ({ default: m.Sms })));

type TabKey =
  | "dashboard"
  | "orders"
  | "products"
  | "clients"
  | "payment"
  | "currencies"
  | "expenses"
  | "admins"
  | "sms";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof IconLayoutDashboard;
  Comp: ComponentType;
  superuser?: boolean;
}

const TABS: TabDef[] = [
  { key: "dashboard", label: "nav_dashboard", icon: IconLayoutDashboard, Comp: Dashboard },
  { key: "orders", label: "nav_orders", icon: IconShoppingCart, Comp: Orders },
  { key: "products", label: "nav_products", icon: IconPackage, Comp: Products },
  { key: "clients", label: "nav_clients", icon: IconUsers, Comp: Clients },
  { key: "payment", label: "nav_payment", icon: IconCreditCard, Comp: PaymentTypes },
  { key: "currencies", label: "nav_currencies", icon: IconCurrencyDollar, Comp: Currencies },
  { key: "expenses", label: "nav_expenses", icon: IconReceipt2, Comp: Expenses },
  { key: "admins", label: "nav_admins", icon: IconUserShield, Comp: Admins, superuser: true },
  { key: "sms", label: "nav_sms", icon: IconMessage, Comp: Sms, superuser: true },
];

export function App() {
  const { me, ready, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [opened, { toggle, close }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();

  if (!ready) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me) return <Login />;

  const tabs = TABS.filter((tb) => !tb.superuser || me.is_superuser);
  const activeKey = location.pathname.replace(/^\//, "") || "dashboard";

  const dark = colorScheme === "dark";
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setColorScheme(next);
    localStorage.setItem("parfume_theme", next);
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" lineClamp={1}>
              Amore Here{" "}
              <Text span c="amore" inherit>
                Sulwhasoo
              </Text>
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Menu shadow="md" width={120}>
              <Menu.Target>
                <Button variant="subtle" size="xs" leftSection={<IconLanguage size={16} />}>
                  {lang.toUpperCase()}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {LANGS.map((l) => (
                  <Menu.Item key={l.value} onClick={() => setLang(l.value as Lang)}>
                    {l.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Tooltip label={dark ? "Light" : "Dark"}>
              <ActionIcon variant="default" onClick={toggleTheme} size="lg">
                {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={`${me.login}${me.is_superuser ? " ★" : ""}`}>
              <ActionIcon variant="subtle" color="red" onClick={logout} size="lg">
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {tabs.map((tb) => (
            <NavLink
              key={tb.key}
              active={tb.key === activeKey}
              label={t(tb.label)}
              leftSection={<tb.icon size={18} />}
              onClick={() => {
                navigate("/" + tb.key);
                close();
              }}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Suspense
          fallback={
            <Center mih="50vh">
              <Loader />
            </Center>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            {tabs.map((tb) => (
              <Route key={tb.key} path={"/" + tb.key} element={<tb.Comp />} />
            ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <DailyRatePrompt />
      </AppShell.Main>
    </AppShell>
  );
}
