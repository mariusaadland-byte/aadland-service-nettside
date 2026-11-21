import { redirect } from "next/navigation";
import { getAdminUser } from "../../../lib/auth";
import {canEditProjectDrawings} from "../../../lib/projectDrawingPermissions";
import DrawingClient from "./DrawingClient";

export const metadata = { title: "Tegning & visualisering" };

export default async function DrawingPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");
  if(!canEditProjectDrawings(admin))redirect("/admin/tegninger");
  return <DrawingClient />;
}
