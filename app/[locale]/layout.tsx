import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { Nav } from "@/components/Nav";
import { PwaInstall } from "@/components/PwaInstall";
import { CommandPalette } from "@/components/CommandPalette";
import { MarketTicker } from "@/components/MarketTicker";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import { PageTitleUpdater } from "@/components/PageTitleUpdater";
import { OnboardingTour } from "@/components/OnboardingTour";
import { MoversAutoScan } from "@/components/MoversAutoScan";
import { ToastHost } from "@/components/ToastHost";
import { NavigationProgress } from "@/components/NavigationProgress";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FavoriteToggle } from "@/components/FavoriteToggle";
import { ThreeDProvider } from "@/components/ThreeDProvider";
import { HelpProvider } from "@/components/HelpProvider";
import { HelpBar } from "@/components/HelpBar";
import { getCurrentUser } from "@/lib/auth";
import { routing } from "@/i18n/routing";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("appName"),
    description: t("appDescription"),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Stocks",
    },
    icons: {
      icon: [
        { url: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
        { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
      ],
      apple: [{ url: "/icon-192.svg" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0b0f",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Aktiviert statisches Rendern für den aktuellen Locale-Zweig.
  setRequestLocale(locale);

  // Marktticker, Hauptnavigation, PWA-Install-Banner, Command-Palette und
  // Onboarding-Tour sind Elemente der eingeloggten App. Auf öffentlichen
  // Seiten (Login/Register/Impressum/Datenschutz/Hilfe/...) würden sie nur
  // irritieren und teils Daten-Fetches auslösen, die mit 401 enden.
  const user = await getCurrentUser();
  const isLoggedIn = !!user;

  const t = await getTranslations({ locale, namespace: "Skip" });

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/*
          Theme-Init vor Hydration. Ohne dieses Inline-Skript würde die Seite
          beim Reload kurz im Default-Dark-Theme aufblitzen, bevor der
          User-Wert aus localStorage angewendet wird (FOUC).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('ai-stock-analyzer:theme:v1');if(t==='light'||t==='dark'||t==='auto'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();",
          }}
        />
        {/* 3D-Modus-Init analog Theme: vor Hydration setzen, sonst Flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=localStorage.getItem('ai-stock-analyzer:3d:v1');document.documentElement.setAttribute('data-3d',d==='on'?'on':'off');}catch(e){document.documentElement.setAttribute('data-3d','off');}})();",
          }}
        />
        {/* Hilfe-Modus-Init: gleicher Pattern. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=localStorage.getItem('ai-stock-analyzer:help-mode:v1');document.documentElement.setAttribute('data-help',h==='on'?'on':'off');}catch(e){document.documentElement.setAttribute('data-help','off');}})();",
          }}
        />
        {/* Akzentfarbe vor Hydration anwenden — sonst flackert die Standard-
            Farbe kurz auf, bevor der User-Wert greift. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var c=localStorage.getItem('ai-stock-analyzer:accent:v1');if(c&&/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)){document.documentElement.style.setProperty('--accent',c);}}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <a href="#main" className="skip-link">
            {t("toMain")}
          </a>
          <NavigationProgress />
          <PageTitleUpdater />
          {isLoggedIn && <MarketTicker />}
          {isLoggedIn && <Nav />}
          {/* HelpBar nach Nav: sie ist sticky direkt unter der Nav (top: Nav-Höhe)
              und z-30, also IMMER im Viewport sichtbar — egal wie weit der User
              nach unten gescrollt hat. */}
          <HelpBar />
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6"
          >
            {isLoggedIn && (
              <div className="flex items-center justify-between gap-3 mb-2 min-h-[1.5rem]">
                <div className="flex-1 min-w-0">
                  <Breadcrumbs />
                </div>
                <FavoriteToggle />
              </div>
            )}
            {children}
          </main>
          <Footer />
          {isLoggedIn && <PwaInstall />}
          {isLoggedIn && <CommandPalette />}
          <CookieBanner />
          {isLoggedIn && <MoversAutoScan />}
          {isLoggedIn && <OnboardingTour />}
          <ToastHost />
          <ThreeDProvider />
          <HelpProvider />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
