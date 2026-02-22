import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/design-system",
];

// 로그인 상태와 무관하게 항상 접근 가능한 경로
const ALWAYS_PUBLIC_PATHS = [
  "/checklist",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("accessToken")?.value;

  // 항상 접근 가능한 경로 (로그인 여부 무관)
  const isAlwaysPublic = ALWAYS_PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (isAlwaysPublic) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // 공개 경로: 토큰 있으면 대시보드로 리다이렉트
  if (isPublicPath) {
    if (token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 보호 경로: 토큰 없으면 로그인으로 리다이렉트
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
