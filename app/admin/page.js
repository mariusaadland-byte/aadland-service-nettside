import { redirect } from "next/navigation";
import { getAdminUser } from "../../lib/auth";
import AdminClient from "./AdminClient";

export default async function AdminPage({searchParams}) {
  const admin = await getAdminUser();

  if (!admin) {
    redirect("/admin/login");
  }

  const params=await searchParams;
  const requested=typeof params?.vis==="string"?params.vis:"";
  const initialTab=(["rentalBookings","rentalCalendar"].includes(requested)&&(admin.role==="owner"||admin.canViewOrders))?requested:"overview";
  return <AdminClient user={admin} initialTab={initialTab} />;
}
