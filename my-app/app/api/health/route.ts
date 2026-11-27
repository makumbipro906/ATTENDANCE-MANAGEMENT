import { connection } from "next/server";

import {query} from "@/lib/server/database";

export async function GET() {
  await connection();
  try {
    await query("SELECT 1");
    return Response.json({status: "ok", database: "connected"});
  } catch (error) {
    console.error("Readiness check failed:", error);
    return Response.json(
      {status: "not_ready", database: "unavailable"},
      { status: 503 },
    );
  }
}
