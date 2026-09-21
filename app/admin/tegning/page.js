import { redirect } from "next/navigation";
import { getAdminUser } from "../../../lib/auth";
import DrawingClient from "./DrawingClient";

export const metadata = { title: "Tegning & visualisering | Aadland Service" };

export default async function DrawingPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  return <DrawingClient />;
}
