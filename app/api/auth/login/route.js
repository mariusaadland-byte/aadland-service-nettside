import {rateLimitRequest} from "../../../../lib/rateLimit";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import { NextResponse } from "next/server";
import { setAdminCookie } from "../../../../lib/auth";
import { createClient } from "@supabase/supabase-js";
import {db} from "../../../../lib/supabase";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const rateError=await rateLimitRequest(req,{"scope":"admin-login","max":10,"windowSeconds":900,"message":"For mange innloggingsforsøk. Prøv igjen senere."}); if(rateError)return rateError;
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Skriv inn e-post og passord." },
        { status: 400 }
      );
    }

    const normalizedEmail=String(email).trim().toLowerCase();
    const normalizedPassword=String(password);
    if(normalizedEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)||normalizedPassword.length>128){
      return NextResponse.json({error:"Feil e-post eller passord."},{status:401});
    }

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!anonKey||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.SESSION_SECRET){
      return NextResponse.json({error:"Innlogging er ikke konfigurert."},{status:503});
    }
    const authClient = createClient(
      url,
      anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
    const serviceClient=db();
    if(!serviceClient)return NextResponse.json({error:"Innlogging er ikke konfigurert."},{status:503});

    const { data, error } =
      await authClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
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
    } = await serviceClient
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
