import { redirect } from "next/navigation";
import { isAdmin } from "../../lib/auth";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const admin = await isAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminClient />;
}
