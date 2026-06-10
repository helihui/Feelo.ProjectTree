import { ensureSchema, pool } from "@/lib/db"
import { ensureSeeded } from "@/lib/db/seed"
import { NextResponse } from "next/server"

async function count(table: string): Promise<number> {
  const res = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM "${table}"`)
  return res.rows[0]?.c ?? 0
}

export async function GET(request: Request) {
  await ensureSchema()

  const url = new URL(request.url)
  const seed = ["1", "true", "yes"].includes((url.searchParams.get("seed") ?? "").toLowerCase())
  if (seed) await ensureSeeded()

  const [members, projects, nodes, user, session, account, verification] = await Promise.all([
    count("members"),
    count("projects"),
    count("nodes"),
    count("user"),
    count("session"),
    count("account"),
    count("verification"),
  ])

  return NextResponse.json({
    counts: { members, projects, nodes, user, session, account, verification },
    seeded: projects > 0,
    seedTriggered: seed,
  })
}
