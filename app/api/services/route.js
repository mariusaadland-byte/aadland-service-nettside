import { NextResponse } from "next/server";
import { db, fromDbService } from "../../../lib/supabase";

export async function GET() {
  const s = db();
  if (!s) return NextResponse.json({ error: "Databasen er ikke tilgjengelig." }, { status: 503 });
  const { data, error } = await s.from("services").select("*").eq("active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    console.error("SERVICES GET ERROR:", error);
    if (error.code === "42P01") return NextResponse.json({ services: [], setupRequired: true }, { status: 503 });
    return NextResponse.json({ error: "Tjenestene kunne ikke hentes." }, { status: 500 });
  }
  const now = Date.now();
  const services = (data || []).map(fromDbService).filter(service =>
    (!service.publishFrom || new Date(service.publishFrom).getTime() <= now) &&
    (!service.publishUntil || new Date(service.publishUntil).getTime() >= now)
  );
  return NextResponse.json({ services });
}
