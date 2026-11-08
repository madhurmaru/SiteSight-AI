import { seedDemo } from "../lib/demo-seed";
import { db } from "../lib/db";
seedDemo().finally(() => db.$disconnect());
