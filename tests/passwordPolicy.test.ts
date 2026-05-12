import { describe, it, expect } from "vitest";
import { checkPasswordStrength } from "@/lib/passwordPolicy";

describe("checkPasswordStrength", () => {
  it("akzeptiert ein starkes Passwort", () => {
    const r = checkPasswordStrength("correct-horse-battery9");
    expect(r.ok).toBe(true);
  });

  it("weist zu kurze Passwörter ab", () => {
    const r = checkPasswordStrength("short1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/10 Zeichen/);
  });

  it("weist nur-Kleinbuchstaben ab", () => {
    const r = checkPasswordStrength("abcdefghijk");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Zeichenarten/);
  });

  it("akzeptiert Buchstaben + Zahlen", () => {
    const r = checkPasswordStrength("Kaffee1234!");
    expect(r.ok).toBe(true);
  });

  it("weist blacklisted Passwörter ab", () => {
    const r = checkPasswordStrength("passwort123");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/bekannt/);
  });

  it("weist Passwort ab, das die E-Mail-Local-Part enthält", () => {
    const r = checkPasswordStrength("muster.mann-12", {
      email: "muster.mann@example.com",
    });
    expect(r.ok).toBe(false);
  });

  it("weist Passwort ab, das den Namen enthält", () => {
    const r = checkPasswordStrength("Bernhard99!", {
      name: "Bernhard",
    });
    expect(r.ok).toBe(false);
  });

  it("weist wiederholte Zeichen ab", () => {
    const r = checkPasswordStrength("aaaaaaaaaa");
    expect(r.ok).toBe(false);
  });

  it("weist zu lange Passwörter ab", () => {
    const long = "A1" + "b".repeat(200);
    const r = checkPasswordStrength(long);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/128/);
  });
});
