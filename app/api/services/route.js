import { NextResponse } from "next/server";
import { db, fromDbService } from "../../../lib/supabase";

export async function GET() {
  const s = db();
  if (!s) return NextResponse.json({ error: "Databasen er ikke tilgjengelig." }, { status: 503 });
  const { data, error } = await s.from("services").select("*").eq("active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    console.error("SERVICES GET ERROR:", error);
    return NextResponse.json({ services: [] });
  }
  const now = Date.now();
  const services = (data || []).map(fromDbService).filter(service =>
    (!service.publishFrom || new Date(service.publishFrom).getTime() <= now) &&
    (!service.publishUntil || new Date(service.publishUntil).getTime() >= now)
  );
  return NextResponse.json({ services });
}
