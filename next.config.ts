import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Plugin sucht die Loader-Datei standardmäßig in ./i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Default-Limit ist 10 MB. Magazin-PDFs gehen bis 32 MB, daher 35 MB als
  // Puffer über dem Routen-Limit.
  experimental: {
    proxyClientMaxBodySize: "35mb",
  },
};

export default withNextIntl(nextConfig);
