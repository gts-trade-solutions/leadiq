// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const isProtected =
    req.nextUrl.pathname.startsWith("/portal") ||
    req.nextUrl.pathname.startsWith("/admin");

  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/portal/:path*", "/vendor/:path*", "/admin/:path*"],
};
