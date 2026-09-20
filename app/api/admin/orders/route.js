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

  const { id, status, surveyDate, adminNote } = await req.json();

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

  const { error } = await s
    .from("orders")
    .update({ ...(status !== undefined ? { status } : {}), ...(surveyDate !== undefined ? { survey_date: surveyDate || null } : {}), ...(adminNote !== undefined ? { admin_note: adminNote || null } : {}) })
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
