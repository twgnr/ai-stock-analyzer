import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import QRCode from "qrcode";

const ISSUER = "AI Stock Analyzer";

function buildClient(label: string, secret: string): TOTP {
  return new TOTP({
    label,
    issuer: ISSUER,
    secret,
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
  });
}

export function generateSecret(): string {
  const client = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
  });
  return client.generateSecret();
}

export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  try {
    const client = buildClient("verify", secret);
    const res = await client.verify(code.replace(/\s/g, ""), {
      epochTolerance: 30,
    });
    return res.valid === true;
  } catch {
    return false;
  }
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  const client = buildClient(email, secret);
  return client.toURI();
}

export async function generateQrDataUrl(otpAuthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUrl, {
    margin: 1,
    width: 220,
    color: { dark: "#e8eaed", light: "#12141a" },
  });
}
