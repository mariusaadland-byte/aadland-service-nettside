import { NextResponse } from "next/server";
import { db, fromDbProduct } from "../../../lib/supabase";

export async function GET() {
  try {
    const s = db();

    if (!s) {
      return NextResponse.json(
        { error: "Databasen er ikke tilgjengelig." },
        { status: 500 }
      );
    }

    const { data, error } = await s
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("PRODUCTS GET ERROR:", error);

      return NextResponse.json(
        { error: "Produktene kunne ikke hentes." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      products: (data || []).map(fromDbProduct),
    });
  } catch (error) {
    console.error("PRODUCTS GET ERROR:", error);

    return NextResponse.json(
      { error: "Produktene kunne ikke hentes." },
      { status: 500 }
    );
  }
}
