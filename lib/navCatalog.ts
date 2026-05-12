import {
  LayoutDashboard,
  Briefcase,
  Radar,
  Eye,
  Filter,
  Zap,
  Rocket,
  Receipt,
  Coins,
  CalendarDays,
  Bell,
  Compass,
  GitCompare,
  MessageCircle,
  Scale,
  Activity,
  FileText,
  BookOpen,
  Newspaper as NewspaperIcon,
  CalendarClock,
  HelpCircle,
  Shield as ShieldIcon,
  Globe2,
  HeartPulse,
  BookOpen as BookOpenIcon,
  FileText as FileTextIcon,
  Target,
  Trophy,
  Layers,
  type LucideIcon,
} from "lucide-react";

// Keys in messages.Nav (de.json / en.json). Reine Translation-Keys, keine
// menschlichen Strings — werden zur Renderzeit über useTranslations("Nav")
// aufgelöst.
export type NavLabelKey =
  | "dashboard"
  | "portfolio"
  | "watchlist"
  | "alerts"
  | "insights"
  | "chat"
  | "transactions"
  | "rebalance"
  | "risk"
  | "health"
  | "taxReport"
  | "dividends"
  | "dividendsCalendar"
  | "earningsCalendar"
  | "market"
  | "macro"
  | "macroScenario"
  | "screener"
  | "breakout"
  | "discoveries"
  | "peerCompare"
  | "themes"
  | "newsDigest"
  | "trackRecord"
  | "backtest"
  | "magazine"
  | "thesen"
  | "briefing"
  | "strategien"
  | "glossar"
  | "hilfe";

export type NavGroupKey =
  | "groupPortfolio"
  | "groupMarket"
  | "groupAnalysis"
  | "groupContent";

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  showFrom?: "always" | "sm" | "md" | "lg";
  groupKey?: NavGroupKey;
}

// Mobile (xs): nur Dashboard + "Mehr" im Header. Alle anderen Items ab `sm`
// im Header sichtbar bzw. wandern auf xs ins Dropdown.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "dashboard", icon: LayoutDashboard, showFrom: "always" },
  { href: "/portfolio", labelKey: "portfolio", icon: Briefcase, showFrom: "sm", groupKey: "groupPortfolio" },
  { href: "/watchlist", labelKey: "watchlist", icon: Eye, showFrom: "sm", groupKey: "groupMarket" },
  { href: "/alerts", labelKey: "alerts", icon: Bell, showFrom: "sm", groupKey: "groupPortfolio" },
  { href: "/insights", labelKey: "insights", icon: Compass, showFrom: "sm", groupKey: "groupAnalysis" },
  { href: "/chat", labelKey: "chat", icon: MessageCircle, showFrom: "md", groupKey: "groupAnalysis" },
  { href: "/transactions", labelKey: "transactions", icon: Receipt, groupKey: "groupPortfolio" },
  { href: "/rebalance", labelKey: "rebalance", icon: Scale, groupKey: "groupPortfolio" },
  { href: "/portfolio/risk", labelKey: "risk", icon: ShieldIcon, groupKey: "groupPortfolio" },
  { href: "/portfolio/health", labelKey: "health", icon: HeartPulse, groupKey: "groupPortfolio" },
  { href: "/tax-report", labelKey: "taxReport", icon: FileText, groupKey: "groupPortfolio" },
  { href: "/dividends", labelKey: "dividends", icon: Coins, groupKey: "groupMarket" },
  { href: "/dividends-calendar", labelKey: "dividendsCalendar", icon: CalendarClock, groupKey: "groupMarket" },
  { href: "/calendar", labelKey: "earningsCalendar", icon: CalendarDays, groupKey: "groupMarket" },
  { href: "/market", labelKey: "market", icon: Radar, groupKey: "groupMarket" },
  { href: "/macro", labelKey: "macro", icon: Globe2, groupKey: "groupMarket" },
  { href: "/macro-scenario", labelKey: "macroScenario", icon: Globe2, groupKey: "groupMarket" },
  { href: "/screener", labelKey: "screener", icon: Filter, groupKey: "groupAnalysis" },
  { href: "/breakout", labelKey: "breakout", icon: Zap, groupKey: "groupAnalysis" },
  { href: "/discoveries", labelKey: "discoveries", icon: Rocket, groupKey: "groupAnalysis" },
  { href: "/peer-compare", labelKey: "peerCompare", icon: GitCompare, groupKey: "groupAnalysis" },
  { href: "/themes", labelKey: "themes", icon: Layers, groupKey: "groupAnalysis" },
  { href: "/news-digest", labelKey: "newsDigest", icon: NewspaperIcon, groupKey: "groupAnalysis" },
  { href: "/insights/track-record", labelKey: "trackRecord", icon: Trophy, groupKey: "groupAnalysis" },
  { href: "/backtest", labelKey: "backtest", icon: Activity, groupKey: "groupAnalysis" },
  { href: "/magazine", labelKey: "magazine", icon: BookOpen, groupKey: "groupContent" },
  { href: "/thesen", labelKey: "thesen", icon: BookOpenIcon, groupKey: "groupContent" },
  { href: "/briefing", labelKey: "briefing", icon: FileTextIcon, groupKey: "groupContent" },
  { href: "/strategien", labelKey: "strategien", icon: Target, groupKey: "groupContent" },
  { href: "/glossar", labelKey: "glossar", icon: BookOpenIcon, groupKey: "groupContent" },
  { href: "/hilfe", labelKey: "hilfe", icon: HelpCircle, groupKey: "groupContent" },
];

export const NAV_GROUP_ORDER: NavGroupKey[] = [
  "groupPortfolio",
  "groupMarket",
  "groupAnalysis",
  "groupContent",
];

// Findet das NavItem zur aktuellen Route. Bei Sub-Routes wie /portfolio/123
// gewinnt das längste passende Präfix; "/" wird nur exakt gematcht.
export function findNavItemByHref(pathname: string | null): NavItem | null {
  if (!pathname) return null;
  if (pathname === "/") {
    return NAV_ITEMS.find((i) => i.href === "/") || null;
  }
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (item.href === "/") continue;
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) {
        best = item;
      }
    }
  }
  return best;
}

export const VALID_NAV_HREFS: Set<string> = new Set(NAV_ITEMS.map((i) => i.href));
