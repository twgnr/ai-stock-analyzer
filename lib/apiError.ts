import { NextResponse } from "next/server";

/**
 * Marker für Fehler, deren Nachricht für den Endnutzer gedacht ist und
 * sicher an den Client zurückgegeben werden darf. Alles andere
 * (Mongoose-Exceptions, Third-Party-Fehler) wird vom zentralen Handler
 * hinter einer generischen Meldung versteckt, damit keine Interna leaken.
 *
 * Nutzung in lib-Code:
 *   throw new UserFacingError("Kein KI-API-Key hinterlegt.", 503);
 *
 * Nutzung in route.ts:
 *   try { ... } catch (e) { return apiErrorResponse(e); }
 */
export class UserFacingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

/**
 * Einheitliche Fehler-Response für API-Routen.
 * - `UserFacingError` → Original-Message + angegebener HTTP-Status.
 * - Alles andere → generische Nachricht, Original landet im `console.error`.
 */
export function apiErrorResponse(
  e: unknown,
  fallbackStatus = 500,
  fallbackMessage = "Interner Serverfehler. Bitte später erneut versuchen."
): NextResponse {
  if (e instanceof UserFacingError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  // Interne Details nur im Server-Log — keinesfalls an den Client.
  if (e instanceof Error) {
    console.error("[api-error]", e.name, e.message);
  } else {
    console.error("[api-error]", e);
  }
  return NextResponse.json({ error: fallbackMessage }, { status: fallbackStatus });
}
