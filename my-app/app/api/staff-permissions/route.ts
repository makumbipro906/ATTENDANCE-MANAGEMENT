import {connection} from "next/server";

import {getDatabase} from "@/lib/server/database";

export async function GET() {
    await connection();
    try {
        const permissions = await getDatabase().prepare(
            "SELECT id, permission_key, description FROM permissions ORDER BY permission_key",
        ).all();
        return Response.json({permissions}, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load permissions:", error);
        return Response.json({error: "Permissions could not be loaded from PostgreSQL."}, {status: 503});
    }
}
