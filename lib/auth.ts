import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { db } from "./db";
import { allowed } from "./domain";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function currentUser() {
  const token = (await cookies()).get("sitesight_session")?.value;
  if (!token) throw new HttpError(401, "Sign in to continue");
  const session = await db.session.findUnique({
    where: { id: createHash("sha256").update(token).digest("hex") },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date())
    throw new HttpError(401, "Session expired. Sign in again.");
  return session.user;
}
export async function access(projectId: string, action = "read") {
  const user = await currentUser();
  const member = await db.membership.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } },
  });
  if (!member || !allowed(member.role, action))
    throw new HttpError(403, "Your project role does not permit this action");
  return { user, role: member.role };
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: createHash("sha256").update(token).digest("hex"),
      userId,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  (await cookies()).set("sitesight_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
}
