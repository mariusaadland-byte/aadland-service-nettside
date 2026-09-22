import { NextResponse } from "next/server";
import { setAdminCookie } from "../../../../lib/auth";
import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Skriv inn e-post og passord." },
        { status: 400 }
      );
    }

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key||!process.env.SESSION_SECRET)return NextResponse.json({error:"Innlogging er ikke konfigurert."},{status:503});
    const supabase = createClient(
      url,
      key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: String(email).trim().toLowerCase(),
        password,
      });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Feil e-post eller passord." },
        { status: 401 }
      );
    }

    const {
      data: adminUser,
      error: adminError,
    } = await supabase
      .from("admin_users")
      .select(
        "id,email,name,role,can_view_orders,can_update_orders,can_manage_products,can_manage_users,active"
      )
      .eq("id", data.user.id)
      .single();

    if (
      adminError ||
      !adminUser ||
      !adminUser.active
    ) {
      return NextResponse.json(
        {
          error:
            "Du har ikke tilgang til backoffice.",
        },
        { status: 403 }
      );
    }

    await setAdminCookie(data.user.id);

    return NextResponse.json({
      ok: true,
      user: adminUser,
    });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke logge inn." },
      { status: 500 }
    );
  }
}
