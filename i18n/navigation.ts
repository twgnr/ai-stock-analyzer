import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware Wrapper für Next-Navigation:
//   import { Link, useRouter, usePathname, redirect } from "@/i18n/navigation"
// Behalten transparent das aktuelle Locale beim Verlinken / Navigieren bei.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
