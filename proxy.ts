
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { AUTH_COOKIE, isProtected, verifyToken } from "@/lib/editorAuth";

// Routes that DON'T require login — everything else is protected by default
const PUBLIC_PATHS = ["/login", "/auth/callback", "/presentation", "/presentationv2", "/lessonReview", "/textIngest", "/imageIngest"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Password gate: editor pages send you to /unlock, editor APIs answer 401
  const gated = isProtected(pathname);
  if (gated && !(await verifyToken(request.cookies.get(AUTH_COOKIE)?.value))) {
    if (gated === "api") {
      return NextResponse.json({ error: "Locked: unlock the editor first (/unlock)." }, { status: 401 });
    }
    const unlockUrl = new URL("/unlock", request.url);
    unlockUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(unlockUrl);
  }
  // Other APIs pass straight through (no Supabase session work)
  if (pathname.startsWith("/api/")) return NextResponse.next();

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if expired — required for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  const isPublic = 
    pathname === "/" ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  /*
  // Everything is protected UNLESS it's in PUBLIC_PATHS
  if (!isPublic && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  */
  return response;
}

export const config = {
  matcher: [
    // api is included now, for the editor password gate
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
