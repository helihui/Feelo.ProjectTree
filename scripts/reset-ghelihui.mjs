import { readFileSync } from "node:fs"
import pg from "pg"

const { Client } = pg

function loadEnv() {
  try {
    const text = readFileSync(".env", "utf8")
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const [, key, raw] = m
      let value = raw.trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch {}
}

loadEnv()

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found")
  process.exit(1)
}

const dry = process.argv.includes("--dry")

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const email = "ghelihui@gmail.com"

const { rows: users } = await client.query(
  'SELECT id, email FROM "user" WHERE email = $1',
  [email],
)
console.log("matched user rows:", users)

if (users.length === 0) {
  await client.end()
  console.log("no user found, nothing to do")
  process.exit(0)
}

const userIds = users.map((u) => u.id)
const { rows: accounts } = await client.query(
  'SELECT id, "accountId", "providerId", "userId" FROM "account" WHERE "userId" = ANY($1::text[])',
  [userIds],
)
console.log("matched account rows:", accounts)

const { rows: sessions } = await client.query(
  'SELECT id, "userId" FROM "session" WHERE "userId" = ANY($1::text[])',
  [userIds],
)
console.log("matched session rows:", sessions)

if (dry) {
  await client.end()
  console.log("dry run, nothing deleted")
  process.exit(0)
}

await client.query("BEGIN")
try {
  if (sessions.length) {
    await client.query('DELETE FROM "session" WHERE "userId" = ANY($1::text[])', [userIds])
  }
  if (accounts.length) {
    await client.query('DELETE FROM "account" WHERE "userId" = ANY($1::text[])', [userIds])
  }
  await client.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [userIds])
  await client.query("COMMIT")
  console.log("deleted ok")
} catch (err) {
  await client.query("ROLLBACK")
  throw err
} finally {
  await client.end()
}
