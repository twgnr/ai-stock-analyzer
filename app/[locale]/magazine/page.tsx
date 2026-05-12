"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  BookOpen,
  Upload,
  AlertCircle,
  FileText,
  Globe,
  Lock,
  Sparkles,
  User as UserIcon,
  Cpu,
} from "lucide-react";

// Muss zu MAX_PDF_BYTES in app/api/magazine/analyze/route.ts passen.
const MAX_PDF_BYTES = 32 * 1024 * 1024;

type Provider = "claude" | "gemini" | "openai-compat" | "ollama";

const PROVIDER_LABEL_KEYS: Record<Provider, string> = {
  claude: "claude",
  gemini: "gemini",
  "openai-compat": "openaiCompat",
  ollama: "ollama",
};

interface MagazineListItem {
  _id: string;
  magazineTitle: string;
  customTitle?: string | null;
  issueNumber?: string | null;
  issueDate?: string | null;
  summary: string;
  coverTopics: string[];
  recommendationCount: number;
  isPublic: boolean;
  isOwn: boolean;
  uploaderName?: string;
  uploaderEmail?: string;
  originalFilename?: string;
  provider?: string | null;
  model?: string;
  createdAt: string;
}

interface AvailableProvider {
  provider: Provider;
  model: string;
}

interface ListPayload {
  mine: MagazineListItem[];
  shared: MagazineListItem[];
  sharingEnabled: boolean;
  availableProviders: AvailableProvider[];
  defaultProvider: Provider;
}

export default function MagazineListPage() {
  const t = useTranslations("Magazine");
  const tProviders = useTranslations("Magazine.providers");
  const locale = useLocale();
  const localeForDate = locale === "de" ? "de-DE" : "en-US";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ListPayload>({
    mine: [],
    shared: [],
    sharingEnabled: true,
    availableProviders: [],
    defaultProvider: "claude",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  // Default = freigegeben. load() setzt das zurück, falls Admin Sharing
  // global deaktiviert hat.
  const [isPublic, setIsPublic] = useState(true);
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  // "" = Default aus Einstellungen verwenden (kein Override).
  const [providerOverride, setProviderOverride] = useState<"" | Provider>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/magazine");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorLoad"));
      const sharingEnabled = data?.config?.sharingEnabled !== false;
      const availableProviders: AvailableProvider[] = Array.isArray(
        data?.config?.availableProviders
      )
        ? data.config.availableProviders
        : [];
      const defaultProvider: Provider =
        data?.config?.defaultProvider || "claude";
      setItems({
        mine: Array.isArray(data.mine) ? data.mine : [],
        shared: Array.isArray(data.shared) ? data.shared : [],
        sharingEnabled,
        availableProviders,
        defaultProvider,
      });
      // Wenn Sharing off ist und User war auf "shared"-Tab → zurück auf "mine"
      if (!sharingEnabled) {
        setTab("mine");
        setIsPublic(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onFileSelected(file: File) {
    setError(null);
    setUploading(true);
    setUploadProgress(t("uploadProgress"));
    try {
      const form = new FormData();
      form.append("pdf", file);
      if (hint.trim()) form.append("hint", hint.trim());
      if (customTitle.trim()) form.append("customTitle", customTitle.trim());
      if (providerOverride) form.append("provider", providerOverride);
      form.append("isPublic", isPublic ? "true" : "false");

      const res = await fetch("/api/magazine/analyze", {
        method: "POST",
        body: form,
      });
      // Bei 413/504 liefern Proxy/Next.js HTML statt JSON. Content-Type vor
      // dem Parse prüfen, sonst gibt res.json() einen verwirrenden Fehler.
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        if (res.status === 413) {
          throw new Error(
            t("errorPdfTooLargeServer", { max: (MAX_PDF_BYTES / 1024 / 1024).toFixed(0) })
          );
        }
        if (res.status === 504 || res.status === 524) {
          throw new Error(t("errorProxyTimeout"));
        }
        throw new Error(t("errorServerNoJson", { status: res.status }));
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("errorAnalyzeFailed"));
      setUploadProgress(null);
      window.location.href = `/magazine/${data._id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("errorNotPdf"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        t("errorPdfTooLarge", {
          size: (file.size / 1024 / 1024).toFixed(1),
          max: (MAX_PDF_BYTES / 1024 / 1024).toFixed(0),
        })
      );
      e.target.value = "";
      return;
    }
    onFileSelected(file);
    e.target.value = "";
  }

  const visible = tab === "mine" ? items.mine : items.shared;
  // Default-Provider taucht oben als "Standard" auf, deshalb hier raus.
  const overrideOptions = items.availableProviders.filter(
    (p) => p.provider !== items.defaultProvider
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen size={22} className="text-[var(--accent)]" />
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>

      <div className="card p-4 text-xs text-[var(--muted)]">
        {t.rich("intro", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>

      {error && (
        <div role="alert" className="card p-3 text-[var(--red)] flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">{t("uploadSection.heading")}</h2>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            {t("uploadSection.customTitleLabel")}
          </label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={t("uploadSection.customTitlePlaceholder")}
            className="input"
            disabled={uploading}
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            {t("uploadSection.hintLabel")}
          </label>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={t("uploadSection.hintPlaceholder")}
            className="input"
            disabled={uploading}
          />
        </div>

        {(items.availableProviders.length > 1 || overrideOptions.length > 0) && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              <Cpu size={12} className="inline mr-1" />
              {t("uploadSection.providerLabel")}
            </label>
            <div className="flex flex-wrap gap-2">
              <ProviderChip
                active={providerOverride === ""}
                onClick={() => setProviderOverride("")}
                disabled={uploading}
              >
                {t("uploadSection.providerStandard")}
                <span className="text-[var(--muted)] ml-1">
                  ({tProviders(PROVIDER_LABEL_KEYS[items.defaultProvider] as "claude")})
                </span>
              </ProviderChip>
              {overrideOptions.map((p) => (
                <ProviderChip
                  key={p.provider}
                  active={providerOverride === p.provider}
                  onClick={() => setProviderOverride(p.provider)}
                  disabled={uploading}
                >
                  {tProviders(PROVIDER_LABEL_KEYS[p.provider] as "claude")}
                  <span className="text-[var(--muted)] ml-1 text-[10px]">
                    {p.model}
                  </span>
                </ProviderChip>
              ))}
            </div>
            <div className="text-[11px] text-[var(--muted)] mt-1.5">
              {t("uploadSection.providerHint")}
            </div>
          </div>
        )}

        {items.sharingEnabled && (
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={uploading}
              className="mt-0.5"
            />
            <span>
              <span className="flex items-center gap-1">
                <Globe size={14} className="text-[var(--accent)]" />
                {t("uploadSection.shareLabel")}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {t("uploadSection.shareDescription")}
              </span>
            </span>
          </label>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={onInputChange}
          className="hidden"
          disabled={uploading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn btn-primary"
        >
          {uploading ? <div className="spinner" /> : <Upload size={14} />}
          {uploading ? t("uploadSection.analyzing") : t("uploadSection.selectAndAnalyze")}
        </button>
        {uploadProgress && (
          <div className="text-xs text-[var(--muted)]">{uploadProgress}</div>
        )}
      </div>

      {items.sharingEnabled ? (
        <div className="flex gap-2 border-b border-[var(--border)]">
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
            <Lock size={13} className="mr-1 inline" />
            {t("tabs.mine", { count: items.mine.length })}
          </TabButton>
          <TabButton active={tab === "shared"} onClick={() => setTab("shared")}>
            <Globe size={13} className="mr-1 inline" />
            {t("tabs.shared", { count: items.shared.length })}
          </TabButton>
        </div>
      ) : (
        <div className="border-b border-[var(--border)] pb-2 flex items-center gap-2 text-sm text-[var(--muted)]">
          <Lock size={13} />
          {t("sharingDisabled", { count: items.mine.length })}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          <div className="spinner mb-2" />
          {t("loading")}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)]">
          {tab === "mine"
            ? t("emptyMine")
            : t("emptyShared")}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((m) => {
            const displayTitle = m.customTitle || m.magazineTitle;
            const showOriginalAsSubtitle =
              !!m.customTitle && m.customTitle !== m.magazineTitle;
            return (
              <Link
                key={m._id}
                href={`/magazine/${m._id}`}
                className="card card-hover p-4 space-y-2 block"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{displayTitle}</div>
                    {showOriginalAsSubtitle && (
                      <div className="text-xs text-[var(--muted)]">
                        {m.magazineTitle}
                      </div>
                    )}
                    {(m.issueNumber || m.issueDate) && (
                      <div className="text-xs text-[var(--muted)]">
                        {m.issueNumber}
                        {m.issueNumber && m.issueDate ? " • " : ""}
                        {m.issueDate}
                      </div>
                    )}
                  </div>
                  {m.isPublic ? (
                    <Globe size={14} className="text-[var(--green)] flex-shrink-0 mt-1" />
                  ) : (
                    <Lock size={14} className="text-[var(--muted)] flex-shrink-0 mt-1" />
                  )}
                </div>
                {m.summary && (
                  <div className="text-sm text-[var(--muted)] line-clamp-3">
                    {m.summary}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-[var(--muted)] pt-2 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1">
                    <Sparkles size={12} />
                    {m.recommendationCount === 1
                      ? t("recommendationCountOne", { count: m.recommendationCount })
                      : t("recommendationCountOther", { count: m.recommendationCount })}
                  </div>
                  <div className="flex items-center gap-1">
                    {!m.isOwn && (
                      <>
                        <UserIcon size={12} />
                        <span>{m.uploaderName || t("anonymous")}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>
                      {new Date(m.createdAt).toLocaleDateString(localeForDate)}
                    </span>
                  </div>
                </div>
                {(m.model || m.originalFilename) && (
                  <div className="text-xs text-[var(--muted)] flex flex-wrap items-center gap-x-3 gap-y-1">
                    {m.model && (
                      <span className="inline-flex items-center gap-1">
                        <Cpu size={12} /> {m.model}
                      </span>
                    )}
                    {m.originalFilename && (
                      <span className="inline-flex items-center gap-1">
                        <FileText size={12} /> {m.originalFilename}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
        active
          ? "border-[var(--accent)] text-[var(--foreground)]"
          : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function ProviderChip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
          : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}
