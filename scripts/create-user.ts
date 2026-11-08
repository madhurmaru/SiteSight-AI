import { db } from "../lib/db";
import { hash } from "bcryptjs";
async function main() {
  const email = process.env.ADMIN_EMAIL,
    name = process.env.ADMIN_NAME,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !name || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (12+ characters) in the server environment.",
    );
  await db.user.create({
    data: { email, name, passwordHash: await hash(password, 12) },
  });
  console.log(
    "User created. Sign in and create a project to become its administrator.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
