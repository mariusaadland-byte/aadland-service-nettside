import {redirect} from "next/navigation";import {isAdmin} from "../../lib/auth";import AdminClient from "./AdminClient";
export default async function Admin(){if(!await isAdmin())redirect("/admin/login");return <AdminClient/>}
