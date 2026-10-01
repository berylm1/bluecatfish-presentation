import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only a path on this site: "next=@evil.com" made `${origin}${next}` a link
  // to another site (https://our.site@evil.com), and "//evil.com" is one too
  const rawNext = searchParams.get("next") ?? "/";
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
