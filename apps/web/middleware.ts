import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const PROTECTED_SEGMENTS = ["/dashboard", "/settings"];

const intlMiddleware = createMiddleware(routing);

/** Splits a supported-locale prefix off the pathname, if present. */
function splitLocalePrefix(pathname: string): {
  prefix: string;
  rest: string;
} {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) {
      return { prefix: `/${locale}`, rest: "/" };
    }
    if (pathname.startsWith(`/${locale}/`)) {
      return { prefix: `/${locale}`, rest: pathname.slice(locale.length + 1) };
    }
  }
  return { prefix: "", rest: pathname };
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const { prefix, rest } = splitLocalePrefix(pathname);

  const isProtected = PROTECTED_SEGMENTS.some(
    (segment) => rest === segment || rest.startsWith(`${segment}/`),
  );
  if (isProtected && !request.cookies.has("access_token")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `${prefix}/login`;
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  // All pages except API routes, Next internals and static files.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
