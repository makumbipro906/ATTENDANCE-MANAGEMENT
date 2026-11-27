import {connection} from "next/server";
import {cookies} from "next/headers";
import {randomUUID} from "node:crypto";
import {z} from "zod";

import {getDatabase, withPostgresTransaction} from "@/lib/server/database";
import {
    getStaffSession,
    hashPassword,
    hashSessionToken,
    isSafeSameOriginRequest,
    STAFF_SESSION_COOKIE,
    verifyPassword,
} from "@/lib/server/staff-auth";

const profileSchema = z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.union([z.string().trim().email().max(254), z.literal("")]),
    phone: z.string().trim().max(32),
    currentPassword: z.string().max(256).optional(),
    newPassword: z.string().min(12).max(256).optional(),
    confirmPassword: z.string().max(256).optional(),
}).strict().refine((value) => {
    if (!value.newPassword) return !value.currentPassword && !value.confirmPassword;
    return Boolean(value.currentPassword) &&
        value.newPassword === value.confirmPassword &&
        value.newPassword !== value.currentPassword;
}, {
    message: "Enter your current password, choose a different new password, and confirm it.",
});

async function currentStaffUser() {
    const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
    const session = await getStaffSession(token);
    if (!session || !token) return null;
    const user = await getDatabase().prepare(
        `SELECT id, username, email, first_name, last_name, phone, active, created_at, password_hash
         FROM staff_users WHERE id = ?`,
    ).get(session.id) as {
        id: string; username: string | null; email: string | null; first_name: string; last_name: string;
        phone: string | null; active: number; created_at: string; password_hash: string | null;
    } | undefined;
    if (!user) return null;
    return {token, session, user};
}

export async function GET() {
    await connection();
    try {
        const account = await currentStaffUser();
        if (!account) return Response.json({error: "Sign in to view your profile."}, {status: 401});
        return Response.json({
            id: account.user.id,
            username: account.user.username ?? "",
            email: account.user.email ?? "",
            firstName: account.user.first_name,
            lastName: account.user.last_name,
            phone: account.user.phone ?? "",
            active: Boolean(account.user.active),
            createdAt: account.user.created_at,
            roleNames: account.session.roleNames,
            passwordConfigured: Boolean(account.user.password_hash),
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load signed-in staff profile:", error);
        return Response.json({error: "Your profile could not be loaded."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({error: parsed.error.issues[0]?.message ?? "Profile details are invalid."}, {status: 400});
    }

    try {
        const account = await currentStaffUser();
        if (!account) return Response.json({error: "Sign in to update your profile."}, {status: 401});
        const value = parsed.data;
        let passwordHash: string | null = null;
        if (value.newPassword) {
            if (!account.user.password_hash ||
                !await verifyPassword(value.currentPassword ?? "", account.user.password_hash)) {
                return Response.json({error: "Your current password is incorrect."}, {status: 401});
            }
            passwordHash = await hashPassword(value.newPassword);
        }

        await withPostgresTransaction(async (database) => {
            await database.prepare(
                `UPDATE staff_users
                 SET first_name = ?, last_name = ?, email = ?, phone = ?,
                     password_hash = COALESCE(?, password_hash)
                 WHERE id = ?`,
            ).run(value.firstName, value.lastName, value.email || null, value.phone || null, passwordHash, account.user.id);
            if (passwordHash) {
                await database.prepare(
                    "DELETE FROM staff_sessions WHERE staff_user_id = ? AND token_hash <> ?",
                ).run(account.user.id, hashSessionToken(account.token));
                await database.prepare("DELETE FROM staff_login_otps WHERE staff_user_id = ?").run(account.user.id);
            }
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', ?, ?, 'staff_user', ?, ?)`,
            ).run(
                randomUUID(),
                account.user.id,
                passwordHash ? "staff_user.profile_and_password_updated" : "staff_user.profile_updated",
                account.user.id,
                JSON.stringify({username: account.user.username}),
            );
        });

        return Response.json({
            ok: true,
            passwordChanged: Boolean(passwordHash),
        }, {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error &&
            error.code === "23505") {
            return Response.json({error: "That email address is already used by another account."}, {status: 409});
        }
        console.error("Unable to update signed-in staff profile:", error);
        return Response.json({error: "Your profile could not be saved."}, {status: 503});
    }
}
