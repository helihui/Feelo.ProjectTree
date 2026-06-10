import { ensureSchema, pool } from "@/lib/db"
import { NextResponse } from "next/server"

type TableRow = {
  table_schema: string
  table_name: string
  table_type: "BASE TABLE" | "VIEW"
}

export async function GET(request: Request) {
  await ensureSchema()
  const url = new URL(request.url)
  const schema = url.searchParams.get("schema") ?? undefined
  const includeViews = ["1", "true", "yes"].includes(
    (url.searchParams.get("includeViews") ?? "").toLowerCase(),
  )
  const includeSystemSchemas = ["1", "true", "yes"].includes(
    (url.searchParams.get("includeSystemSchemas") ?? "").toLowerCase(),
  )

  const allowedTypes = includeViews ? ["BASE TABLE", "VIEW"] : ["BASE TABLE"]

  const where: string[] = [`table_type = ANY($1::text[])`]
  const params: unknown[] = [allowedTypes]

  if (schema) {
    params.push(schema)
    where.push(`table_schema = $${params.length}`)
  } else if (!includeSystemSchemas) {
    where.push(`table_schema NOT IN ('pg_catalog','information_schema')`)
  }

  const sql = `
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE ${where.join(" AND ")}
    ORDER BY table_schema, table_name
  `

  const res = await pool.query<TableRow>(sql, params)

  return NextResponse.json({
    tables: res.rows.map((r) => ({
      schema: r.table_schema,
      name: r.table_name,
      type: r.table_type,
    })),
  })
}
