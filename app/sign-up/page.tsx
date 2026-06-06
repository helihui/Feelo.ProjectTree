import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AuthForm } from "@/components/auth-form"

export const metadata = { title: "注册 · ProjectTree AI" }

export default async function SignUpPage() {
  const session = await getSession()
  if (session?.user) redirect("/")
  return <AuthForm mode="sign-up" />
}
