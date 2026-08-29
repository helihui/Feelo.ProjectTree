import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

const localDevBaseURL = "http://localhost:3000"
const previewBaseURL =
  process.env.V0_RUNTIME_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined)
const needsCrossSiteCookies = Boolean(previewBaseURL && !previewBaseURL.startsWith(localDevBaseURL))

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL ??
          (process.env.NODE_ENV === "development" ? localDevBaseURL : undefined)),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 天
    updateAge: 60 * 60 * 24, // 1 天
    // 会话签名写入 cookie，5 分钟内的请求不再查库校验
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  ...(process.env.NODE_ENV === "development" && needsCrossSiteCookies
    ? {
        advanced: {
          // 仅在预览 iframe 等跨站场景下使用跨站 cookie；localhost 本地开发保持普通 cookie
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
