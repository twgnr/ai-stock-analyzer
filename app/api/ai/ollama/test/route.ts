import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { validateOllamaBaseUrl } from "@/lib/urlSafety";
import { getApiTranslations } from "@/lib/i18n-server";

/**
 * Verbindungstest für die User-konfigurierte Ollama-Instanz.
 *
 * Frontend übergibt entweder eine Test-URL als Query-Parameter (`?baseUrl=…`)
 * — das passiert während der Konfiguration, bevor der User auf Speichern
 * klickt — oder lässt das Feld weg, dann wird die persistierte URL aus dem
 * User-Profil verwendet.
 *
 * Wir rufen Ollamas natives `GET /api/tags` auf (nicht den OpenAI-kompat-
 * Pfad), weil das eine schöne Liste der lokal installierten Modelle inkl.
 * Größe zurückgibt. Aus der OpenAI-kompat-Route `/v1/models` käme nur
 * `id`, `created` — weniger nützlich für die UI-Auswahl.
 *
 * Der Endpoint sendet serverseitig fetch zu einer User-gewählten URL —
 * SSRF-Risiko ist beabsichtigt akzeptiert (siehe validateOllamaBaseUrl-
 * Kommentar). Der Endpoint gibt jedoch nur den geparsten Model-Listen-
 * Body zurück, niemals rohe Response-Bytes — so kann der Endpoint nicht
 * als blinder Proxy missbraucht werden.
 */
export async function GET(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const queryUrl = searchParams.get("baseUrl");
  const baseUrl = (queryUrl ?? user.ollamaBaseUrl ?? "").trim();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Keine Ollama-Base-URL angegeben" },
      { status: 400 }
    );
  }

  const check = validateOllamaBaseUrl(baseUrl);
  if (!check.ok) {
    return NextResponse.json(
      { error: `Ungültige URL: ${check.reason}` },
      { status: 400 }
    );
  }

  // Ollama empfiehlt `http://localhost:11434/v1` als OpenAI-kompat-Endpoint —
  // für die native API müssen wir aber den /v1-Suffix entfernen, sonst
  // antwortet der Server mit 404. Robust: bauen den native-API-Pfad aus
  // origin + "/api/tags".
  let nativeUrl: URL;
  try {
    const u = new URL(baseUrl);
    nativeUrl = new URL("/api/tags", `${u.protocol}//${u.host}`);
  } catch {
    return NextResponse.json(
      { error: "Konnte URL nicht parsen" },
      { status: 400 }
    );
  }

  // Hartes Timeout — sonst hängt das UI minutenlang, wenn der User die
  // falsche URL eingibt und der TCP-Connect ins Leere läuft.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(nativeUrl.toString(), {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Ollama antwortete mit HTTP ${res.status}`,
        },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { models?: Array<{ name: string; size?: number }> };
    const models = (data.models ?? []).map((m) => ({
      name: m.name,
      sizeMb: typeof m.size === "number" ? Math.round(m.size / (1024 * 1024)) : null,
    }));
    return NextResponse.json({
      ok: true,
      baseUrl,
      modelCount: models.length,
      models,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verbindungsfehler";
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "Zeitüberschreitung — läuft der Ollama-Server unter dieser URL? Standardport ist 11434."
          : `Konnte Ollama nicht erreichen: ${msg}`,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
