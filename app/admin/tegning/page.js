import { redirect } from "next/navigation";
import { getAdminUser, hasPermission } from "../../../lib/auth";
import DrawingClient from "./DrawingClient";

export const metadata = { title: "Tegning & visualisering" };

export default async function DrawingPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  const canUseDrawing=(await hasPermission("canManageProducts"))||(await hasPermission("canViewOrders"));
  if (!canUseDrawing) redirect("/admin");
  return <DrawingClient />;
}
