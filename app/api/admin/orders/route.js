import { NextResponse } from "next/server";
import {
  getAdminUser,
  hasPermission,
} from "../../../../lib/auth";
import { db } from "../../../../lib/supabase";

const mapOrder = (o) => ({
  id: o.id,
  orderNumber: o.order_number,
  orderType: o.order_type,
  status: o.status,
  customerName: o.customer?.name || "",
  customerEmail: o.customer?.email || "",
  customerPhone: o.customer?.phone || "",
  customer: o.customer,
  fulfillmentType: o.fulfillment_type,
  deliveryWithinRadius: o.delivery_within_radius,
  items: o.items || [],
  customRequest: o.custom_request,
  totalOre: o.total_ore,
  createdAt: o.created_at,
  surveyDate: o.survey_date || null,
  adminNote: o.admin_note || "",
  paymentStatus: o.payment_status || "unpaid",
  paymentReference: o.payment_reference || "",
  trackingNumber: o.tracking_number || "",
  trackingUrl: o.tracking_url || "",
  dispatchedAt: o.dispatched_at || null,
  deliveredAt: o.delivered_at || null,
});

export async function GET() {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canViewOrders"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å se bestillinger." },
      { status: 403 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  const { data, error } = await s
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("ADMIN ORDERS GET ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: `Bestillingene kunne ikke hentes: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    orders: (data || []).map(mapOrder),
  });
}

export async function PATCH(req) {
  const currentUser = await getAdminUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Ikke innlogget." },
      { status: 401 }
    );
  }

  if (!(await hasPermission("canUpdateOrders"))) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å endre bestillinger." },
      { status: 403 }
    );
  }

  const { id, status, surveyDate, adminNote, trackingNumber, trackingUrl, action } = await req.json();

  const allowed = [
    "new",
    "confirmed",
    "in_progress",
    "ready",
    "completed",
    "cancelled",
  ];

  if (!id) {
    return NextResponse.json(
      { error: "Bestilling mangler." },
      { status: 400 }
    );
  }

  if (status !== undefined && !allowed.includes(status)) {
    return NextResponse.json(
      { error: "Ugyldig status." },
      { status: 400 }
    );
  }

  const s = db();

  if (!s) {
    return NextResponse.json(
      { error: "Databasen er ikke tilgjengelig." },
      { status: 500 }
    );
  }

  if (action === "mark-dispatched" || action === "mark-delivered") {
    const {data:order,error:findError}=await s.from("orders").select("*").eq("id",id).single();
    if(findError||!order)return NextResponse.json({error:"Bestillingen ble ikke funnet."},{status:404});
    if(order.order_type==="custom")return NextResponse.json({error:"Denne handlingen gjelder produktbestillinger."},{status:400});
    if(action==="mark-dispatched"&&order.fulfillment_type!=="shipping")return NextResponse.json({error:"Bare bestillinger som sendes kan markeres som sendt."},{status:400});
    if(action==="mark-delivered"&&order.fulfillment_type==="shipping")return NextResponse.json({error:"Bruk Sendt til kunde for bestillinger som sendes."},{status:400});
    const now=new Date().toISOString(),patch=action==="mark-dispatched"?{status:"completed",dispatched_at:now}:{status:"completed",delivered_at:now};
    const {error:updateError}=await s.from("orders").update(patch).eq("id",id);
    if(updateError)return NextResponse.json({error:"Handlingen kunne ikke lagres."},{status:500});
    if(process.env.RESEND_API_KEY&&order.customer?.email){
      try{
        const {Resend}=await import("resend"),resend=new Resend(process.env.RESEND_API_KEY),from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>",replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
        const sent=action==="mark-dispatched";
        await resend.emails.send({from,to:order.customer.email,replyTo,subject:sent?"Bestillingen din er sendt – "+order.order_number:"Bestillingen din er levert – "+order.order_number,text:sent?`Hei ${order.customer.name||""}!\n\nBestillingen ${order.order_number} er sendt.${order.tracking_number?"\nSporingsnummer: "+order.tracking_number:""}${order.tracking_url?"\nSporing: "+order.tracking_url:""}\n\nAadland Service\npost@aadland-service.no`:`Hei ${order.customer.name||""}!\n\nBestillingen ${order.order_number} er registrert som levert.\n\nAadland Service\npost@aadland-service.no`});
        await s.from("orders").update(sent?{tracking_sent_at:now}:{delivery_notice_sent_at:now}).eq("id",id);
      }catch(e){console.error("ORDER STATUS EMAIL ERROR",e)}
    }
    return NextResponse.json({ok:true,paymentCaptureRequired:order.payment_status==="authorized"});
  }

  const { error } = await s
    .from("orders")
    .update({ ...(status !== undefined ? { status } : {}), ...(surveyDate !== undefined ? { survey_date: surveyDate || null } : {}), ...(adminNote !== undefined ? { admin_note: adminNote || null } : {}), ...(trackingNumber !== undefined ? { tracking_number: String(trackingNumber||"").trim() || null } : {}), ...(trackingUrl !== undefined ? { tracking_url: String(trackingUrl||"").trim() || null } : {}) })
    .eq("id", id);

  if (error) {
    console.error("ADMIN ORDER UPDATE ERROR:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      {
        error: `Status kunne ikke lagres: ${
          error.message || "Ukjent databasefeil"
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
