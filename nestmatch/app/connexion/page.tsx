import { redirect } from "next/navigation"

export default function ConnexionRedirect() {
  redirect("/auth")
}
