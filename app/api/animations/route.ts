import { NextResponse } from "next/server";
import { lazySupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rateLimit";

const supabase = lazySupabaseAdmin();   // created on first use, so the build doesn't need env vars

// POST { cacheKey } → that lesson build's animations and how far they've got
export async function POST(req: Request) {
  const limited = await rateLimit(req, "slides");
  if (limited) return limited;
  // (was: any body went straight to the database lookup, and one that wasn't JSON crashed the route)
  const body = await req.json().catch(() => null);
  const cacheKey = typeof body?.cacheKey === "string" ? body.cacheKey.slice(0, 200) : "";
  if (!cacheKey) return NextResponse.json({ animations: {}, status: "unknown" }, { status: 400 });
  try {
    const { data } = await supabase
      .from("animation_jobs")
      .select("animations, status")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    return NextResponse.json(data ?? { animations: {}, status: "unknown" });
  } catch (e) {
    console.error("animations error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ animations: {}, status: "unknown" }, { status: 500 });
  }
}
