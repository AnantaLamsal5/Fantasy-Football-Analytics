import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/leaderboard", "/predictions", "/teams", "/matches", "/transfers", "/profile"];
const ADMIN_PREFIX = "/admin";

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return decoded;
  } catch (e) {
    return null;
  }
}

function isTokenExpired(token) {
  if (!token) return true;
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;
  return Date.now() >= (decoded.exp * 1000) - 5000;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const requiresAuth = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const requiresAdmin = pathname.startsWith(ADMIN_PREFIX);
  const isAdminAuthPage = pathname === "/admin/login" || pathname === "/admin/signup";

  if (!requiresAuth && !requiresAdmin) {
    return NextResponse.next();
  }

  if (isAdminAuthPage) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("ff_access")?.value;
  const role = request.cookies.get("ff_role")?.value;

  if (!accessToken) {
    return NextResponse.redirect(new URL(requiresAdmin ? "/admin/login" : "/login", request.url));
  }

  if (isTokenExpired(accessToken)) {
    const response = NextResponse.redirect(new URL(requiresAdmin ? "/admin/login" : "/login", request.url));
    response.cookies.set("ff_access", "", { maxAge: 0 });
    response.cookies.set("ff_refresh", "", { maxAge: 0 });
    response.cookies.set("ff_role", "", { maxAge: 0 });
    return response;
  }

  if (requiresAdmin && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/leaderboard/:path*", "/predictions/:path*", "/teams/:path*", "/matches/:path*", "/transfers/:path*", "/profile/:path*", "/admin/:path*"],
};
