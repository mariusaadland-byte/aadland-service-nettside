import { redirect } from "next/navigation";
import { getAdminUser, hasPermission } from "../../../lib/auth";
import DrawingClient from "./DrawingClient";

export const metadata = { title: "Tegning & visualisering" };

export default async function DrawingPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if (!(await hasPermission("canManageProducts"))) redirect("/admin");
  return <DrawingClient />;
}
