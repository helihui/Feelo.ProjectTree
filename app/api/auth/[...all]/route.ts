import { auth } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const handler = auth.handler

export const GET = handler
export const POST = handler
