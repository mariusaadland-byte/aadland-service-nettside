import { redirect } from "next/navigation";
import { getAdminUser } from "../../lib/auth";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const admin = await getAdminUser();

  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminClient user={admin} />;
}
