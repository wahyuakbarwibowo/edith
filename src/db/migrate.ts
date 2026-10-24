import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./index.ts";

await migrate(db, { migrationsFolder: `${import.meta.dir}/migrations` });
console.log("migrations applied");
process.exit(0);
