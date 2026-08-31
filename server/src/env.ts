import { z } from "zod";

// Fail fast and loudly at boot: a missing credential must not surface later as a
// confusing 500 from a route handler.
const schema = z.object({
  MONGODB_URI: z.string().startsWith("mongodb"),
  // Signs session tokens. Long enough that HS256 is not the weak link.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n  ");
  throw new Error(
    `Invalid or missing environment variables:\n  ${problems}\n` +
      `Copy .env.example to .env at the repo root and fill it in — see the README.`,
  );
}

export const env = parsed.data;
