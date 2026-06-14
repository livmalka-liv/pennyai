import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("penny_token")?.value;

  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // Already logged in → send to app
    if (token) return NextResponse.redirect(new URL("/sandbox", req.url));
    return NextResponse.next();
  }

  // Protected route — must have token
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
