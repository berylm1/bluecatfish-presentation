import { NextResponse } from "next/server";
import { lazySupabaseAdmin } from "@/lib/supabase/admin";

const supabase = lazySupabaseAdmin();   // created on first use, so the build doesn't need env vars

export async function POST(req: Request) {
  const { cacheKey } = await req.json();
  const { data } = await supabase
    .from("animation_jobs")
    .select("animations, status")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  return NextResponse.json(data ?? { animations: {}, status: "unknown" });
}
