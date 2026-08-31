import type { FastifyReply, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.ts";

const secret = new TextEncoder().encode(env.AUTH_SECRET);
const ISSUER = "efinance";
const TTL = "7d";

export type AuthedUser = { id: string; email: string };

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

export async function issueToken(user: AuthedUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

// Invariant 1: identity comes from the verified token and nowhere else. There is
// deliberately no code path that reads a user id from a body, query, or header.
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing bearer token" });
  }

  try {
    const { payload } = await jwtVerify(header.slice(7), secret, {
      issuer: ISSUER,
    });
    if (typeof payload.sub !== "string") {
      return reply.code(401).send({ error: "token has no subject" });
    }
    req.user = {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
    };
  } catch {
    return reply.code(401).send({ error: "invalid or expired token" });
  }
}
