import {connection} from "next/server";
import {cookies} from "next/headers";
import {randomUUID} from "node:crypto";
import {z} from "zod";

import {getDatabase, withPostgresTransaction, type PostgresDatabase} from "@/lib/server/database";
import {getStaffSession, hashPassword, issueStaffLoginOtp, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

const staffUserSchema = z.object({
    id: z.string().uuid().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    username: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/),
    email: z.union([z.string().trim().email().max(254), z.literal("")]),
    phone: z.string().trim().min(1).max(32),
    roleIds: z.array(z.string().min(1).max(100)).min(1).max(20),
    password: z.string().min(12).max(256).optional(),
}).strict();

const staffStatusSchema = z.object({
    id: z.string().uuid(),
    active: z.boolean(),
}).strict();

type StaffUserRow = {
    id: string;
    first_name: string;
    last_name: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    roles: string | null;
    role_ids: string | null;
    active: number;
    created_at: string;
    password_configured: number;
};

async function readStaffUsers() {
    const database = getDatabase();
    const users = await database.prepare(
        `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.phone, u.active, u.created_at,
                u.password_hash IS NOT NULL AS password_configured,
                string_agg(DISTINCT r.name, ',') AS roles,
                string_agg(DISTINCT r.id, ',') AS role_ids
         FROM staff_users u
         LEFT JOIN staff_user_roles ur ON ur.staff_user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         GROUP BY u.id
         ORDER BY u.created_at DESC, u.last_name, u.first_name`,
    ).all() as StaffUserRow[];
    const roles = await database.prepare(
        "SELECT id, name FROM roles ORDER BY name",
    ).all() as {id: string; name: string}[];

    return {
        users: users.map((user) => ({
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            username: user.username ?? "",
            email: user.email ?? "",
            phone: user.phone ?? "",
            roleNames: user.roles?.split(",") ?? [],
            roleIds: user.role_ids?.split(",") ?? [],
            active: Boolean(user.active),
            createdAt: user.created_at,
            credentialsConfigured: Boolean(user.password_configured),
        })),
        roles,
    };
}

async function writeRoleAssignments(database: PostgresDatabase, staffUserId: string, roleIds: string[]) {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length) {
        const placeholders = uniqueRoleIds.map(() => "?").join(", ");
        const found = await database.prepare(`SELECT count(*) AS count FROM roles WHERE id IN (${placeholders})`)
            .get(...uniqueRoleIds) as {count: number};
        if (Number(found.count) !== uniqueRoleIds.length) {
            throw new Error("Choose roles that exist in staff management.");
        }
    }
    await database.prepare("DELETE FROM staff_user_roles WHERE staff_user_id = ?").run(staffUserId);
    const assignRole = database.prepare(
        "INSERT INTO staff_user_roles (staff_user_id, role_id) VALUES (?, ?)",
    );
    for (const roleId of uniqueRoleIds) await assignRole.run(staffUserId, roleId);
}

function isUniqueConstraint(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error &&
        error.code === "23505";
}

async function requireSuperAdministrator() {
    const cookieStore = await cookies();
    const session = await getStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
    return Boolean(session?.roleNames.some((name) => name.toLocaleLowerCase() === "super-administrator"));
}

function normalizeUgandanPhone(value: string) {
    const compact = value.trim().replace(/[\s()-]/g, "");
    const international = compact.startsWith("+")
        ? compact
        : compact.startsWith("0")
            ? `+256${compact.slice(1)}`
            : `+256${compact}`;
    if (!/^\+256[37]\d{8}$/.test(international)) {
        throw new Error("Enter a valid Ugandan mobile number, for example +2567XXXXXXXX.");
    }
    return international;
}

export async function GET() {
    await connection();
    try {
        return Response.json(await readStaffUsers(), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load staff users:", error);
        return Response.json({error: "Staff users could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function POST(request: Request) {
    await connection();
    if (!await requireSuperAdministrator()) {
        return Response.json({error: "Only a Super Administrator can create staff users."}, {status: 403});
    }
    const parsed = staffUserSchema.omit({password: true}).safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({error: "Enter valid user details.", details: parsed.error.flatten()}, {status: 400});
    }
    const user = parsed.data;
    let phone: string;
    try {
        phone = normalizeUgandanPhone(user.phone);
    } catch (error) {
        return Response.json({error: error instanceof Error ? error.message : "Enter a valid Ugandan mobile number."}, {status: 400});
    }
    const id = randomUUID();

    try {
        await withPostgresTransaction(async (database) => {
            await database.prepare(
                `INSERT INTO staff_users (id, username, email, first_name, last_name, phone, password_hash)
                 VALUES (?, ?, ?, ?, ?, ?, NULL)`,
            ).run(id, user.username, user.email || null, user.firstName, user.lastName, phone);
            await writeRoleAssignments(database, id, user.roleIds);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'staff_user.created', 'staff_user', ?, ?)`,
            ).run(randomUUID(), id, JSON.stringify({username: user.username}));
        });
        await issueStaffLoginOtp(id, false, "activation");
        return Response.json((await readStaffUsers()).users.find((item) => item.id === id), {status: 201});
    } catch (error) {
        if (error instanceof Error && ["OTP_NOT_CONFIGURED", "OTP_PHONE_MISSING", "OTP_DELIVERY_FAILED"].includes(error.message)) {
            await withPostgresTransaction(async (database) => {
                await database.prepare("DELETE FROM staff_users WHERE id = ?").run(id);
                await database.prepare("DELETE FROM audit_log WHERE entity_type = 'staff_user' AND entity_id = ? AND action = 'staff_user.created'")
                    .run(id);
            });
            const message = error.message === "OTP_NOT_CONFIGURED"
                ? "The SMS service is not configured. No user account was created."
                : error.message === "OTP_PHONE_MISSING"
                    ? "A valid phone number is required to send the activation code. No user account was created."
                    : "The activation SMS could not be sent. No user account was created.";
            return Response.json({error: message}, {status: 503});
        }
        if (isUniqueConstraint(error)) {
            return Response.json({error: "That username or email address is already in use."}, {status: 409});
        }
        if (error instanceof Error && error.message.includes("Choose roles")) {
            return Response.json({error: error.message}, {status: 400});
        }
        console.error("Unable to create staff user:", error);
        return Response.json({error: "Staff user could not be created in PostgreSQL."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    if (!await requireSuperAdministrator()) {
        return Response.json({error: "Only a Super Administrator can update staff users."}, {status: 403});
    }
    const parsed = staffUserSchema.extend({id: z.string().uuid()})
        .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return Response.json({error: "Enter valid user details.", details: parsed.error.flatten()}, {status: 400});
    }
    const user = parsed.data;
    let phone: string;
    try {
        phone = normalizeUgandanPhone(user.phone);
    } catch (error) {
        return Response.json({error: error instanceof Error ? error.message : "Enter a valid Ugandan mobile number."}, {status: 400});
    }

    try {
        const passwordHash = user.password ? await hashPassword(user.password) : null;
        const updated = await withPostgresTransaction(async (database) => {
            const result = await database.prepare(
                `UPDATE staff_users SET username = ?, email = ?, first_name = ?, last_name = ?, phone = ?,
                 password_hash = COALESCE(?, password_hash)
                 WHERE id = ?`,
            ).run(user.username, user.email || null, user.firstName, user.lastName, phone, passwordHash, user.id);
            if (Number(result.changes) === 0) return false;
            await writeRoleAssignments(database, user.id, user.roleIds);
            if (passwordHash) await database.prepare("DELETE FROM staff_sessions WHERE staff_user_id = ?").run(user.id);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'staff_user.updated', 'staff_user', ?, ?)`,
            ).run(randomUUID(), user.id, JSON.stringify({username: user.username, passwordReset: Boolean(passwordHash)}));
            return true;
        });
        if (!updated) return Response.json({error: "Staff user was not found."}, {status: 404});
        return Response.json((await readStaffUsers()).users.find((item) => item.id === user.id));
    } catch (error) {
        if (isUniqueConstraint(error)) {
            return Response.json({error: "That username or email address is already in use."}, {status: 409});
        }
        if (error instanceof Error && error.message.includes("Choose roles")) {
            return Response.json({error: error.message}, {status: 400});
        }
        console.error("Unable to update staff user:", error);
        return Response.json({error: "Staff user could not be updated in PostgreSQL."}, {status: 503});
    }
}

export async function PATCH(request: Request) {
    await connection();
    if (!await requireSuperAdministrator()) {
        return Response.json({error: "Only a Super Administrator can change staff-user status."}, {status: 403});
    }
    const parsed = staffStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Choose a valid user status."}, {status: 400});
    const {id, active} = parsed.data;

    try {
        const updated = await withPostgresTransaction(async (database) => {
            const result = await database.prepare("UPDATE staff_users SET active = ? WHERE id = ?").run(Number(active), id);
            if (Number(result.changes) === 0) return false;
            if (!active) await database.prepare("DELETE FROM staff_sessions WHERE staff_user_id = ?").run(id);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', ?, 'staff_user', ?, ?)`,
            ).run(randomUUID(), active ? "staff_user.activated" : "staff_user.deactivated", id, JSON.stringify({active}));
            return true;
        });
        if (!updated) return Response.json({error: "Staff user was not found."}, {status: 404});
        return Response.json((await readStaffUsers()).users.find((item) => item.id === id));
    } catch (error) {
        console.error("Unable to change staff-user status:", error);
        return Response.json({error: "Staff-user status could not be updated in PostgreSQL."}, {status: 503});
    }
}
