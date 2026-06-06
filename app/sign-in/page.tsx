import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AuthForm } from "@/components/auth-form"

export const metadata = { title: "登录 · ProjectTree AI" }

export default async function SignInPage() {
  const session = await getSession()
  if (session?.user) redirect("/")
  return <AuthForm mode="sign-in" />
}
