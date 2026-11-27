import {cookies} from "next/headers";
import {connection} from "next/server";

import {getDatabase} from "@/lib/server/database";
import {isGithubOAuthConfigured} from "@/lib/server/github-oauth";
import {getStaffSession, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

function isSuperAdministrator(roleNames: string[]) {
    return roleNames.some((name) => name.toLocaleLowerCase() === "super-administrator");
}

export async function GET() {
    await connection();
    const enabled = isGithubOAuthConfigured();
    if (!enabled) {
        return Response.json({enabled}, {headers: {"Cache-Control": "no-store"}});
    }
    try {
        const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
        const session = await getStaffSession(token);
        const eligible = Boolean(session && isSuperAdministrator(session.roleNames));
        if (!session || !eligible) {
            return Response.json({enabled}, {headers: {"Cache-Control": "no-store"}});
        }
        const account = await getDatabase().prepare(
            "SELECT github_user_id FROM staff_users WHERE id = ?",
        ).get(session.id) as {github_user_id: string | null} | undefined;
        if (!account) return Response.json({error: "The signed-in account could not be found."}, {status: 404});
        return Response.json({
            enabled,
            eligible,
            connected: Boolean(account.github_user_id),
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load GitHub sign-in status:", error);
        return Response.json({error: "GitHub sign-in status could not be loaded."}, {status: 503});
    }
}
