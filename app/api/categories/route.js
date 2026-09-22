import { NextResponse } from "next/server";
import {
  db,
  fromDbCategory,
} from "../../../lib/supabase";

export async function GET() {
  try {
    const s = db();

    if (!s) {
      return NextResponse.json(
        {
          error:
            "Databasen er ikke tilgjengelig.",
        },
        { status: 503 }
      );
    }

    const { data, error } = await s
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        "CATEGORIES GET ERROR:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Kategoriene kunne ikke hentes.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      categories: (data || []).map(
        fromDbCategory
      ),
    });
  } catch (error) {
    console.error(
      "CATEGORIES GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Kategoriene kunne ikke hentes.",
      },
      { status: 500 }
    );
  }
}
