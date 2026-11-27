import {connection} from "next/server";
import {randomUUID} from "node:crypto";
import {z} from "zod";

import {getDatabase, withPostgresTransaction} from "@/lib/server/database";

const createRoleSchema = z.object({
    name: z.string().trim().min(2).max(100),
}).strict();

const renameRoleSchema = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(100),
}).strict();

const updatePermissionsSchema = z.object({
    id: z.string().uuid(),
    permissionIds: z.array(z.string().min(1).max(100)).max(200),
}).strict();

const deleteRoleSchema = z.object({id: z.string().uuid()}).strict();

async function readRoles() {
    const database = getDatabase();
    const roles = await database.prepare(
        `SELECT r.id, r.name, r.description, count(DISTINCT ur.staff_user_id) AS user_count
         FROM roles r
         LEFT JOIN staff_user_roles ur ON ur.role_id = r.id
         GROUP BY r.id
         ORDER BY r.name`,
    ).all() as {id: string; name: string; description: string | null; user_count: number}[];
    const permissions = await database.prepare(
        `SELECT rp.role_id, p.id, p.permission_key, p.description
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         ORDER BY p.permission_key`,
    ).all() as {role_id: string; id: string; permission_key: string; description: string}[];
    const permissionList = await database.prepare(
        "SELECT id, permission_key, description FROM permissions ORDER BY permission_key",
    ).all() as {id: string; permission_key: string; description: string}[];
    const permissionsByRole = new Map<string, typeof permissions>();
    for (const permission of permissions) {
        const items = permissionsByRole.get(permission.role_id) ?? [];
        items.push(permission);
        permissionsByRole.set(permission.role_id, items);
    }

    return {
        roles: roles.map((role) => {
            const assignedPermissions = permissionsByRole.get(role.id) ?? [];
            const locked = role.name.toLocaleLowerCase() === "super-administrator";
            return {
                id: role.id,
                name: role.name,
                description: role.description ?? "",
                userCount: Number(role.user_count),
                locked,
                permissions: locked
                    ? permissionList
                    : assignedPermissions.map(({id, permission_key, description}) => ({id, permission_key, description})),
                permissionCount: locked ? permissionList.length : assignedPermissions.length,
            };
        }),
        permissions: permissionList,
    };
}

function isUniqueConstraint(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error &&
        error.code === "23505";
}

async function isLockedRole(roleId: string) {
    const role = await getDatabase().prepare("SELECT name FROM roles WHERE id = ?").get(roleId) as {name: string} | undefined;
    return role?.name.toLocaleLowerCase() === "super-administrator";
}

export async function GET() {
    await connection();
    try {
        return Response.json(await readRoles(), {headers: {"Cache-Control": "no-store"}});
    } catch (error) {
        console.error("Unable to load staff roles:", error);
        return Response.json({error: "Roles and permissions could not be loaded from PostgreSQL."}, {status: 503});
    }
}

export async function POST(request: Request) {
    await connection();
    const parsed = createRoleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Enter a valid role name."}, {status: 400});

    const id = randomUUID();
    try {
        await withPostgresTransaction(async (database) => {
            await database.prepare("INSERT INTO roles (id, name) VALUES (?, ?)").run(id, parsed.data.name);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'staff_role.created', 'staff_role', ?, ?)`,
            ).run(randomUUID(), id, JSON.stringify({name: parsed.data.name}));
        });
        return Response.json((await readRoles()).roles.find((role) => role.id === id), {status: 201});
    } catch (error) {
        if (isUniqueConstraint(error)) return Response.json({error: "A role with that name already exists."}, {status: 409});
        console.error("Unable to create staff role:", error);
        return Response.json({error: "Role could not be created in PostgreSQL."}, {status: 503});
    }
}

export async function PUT(request: Request) {
    await connection();
    const payload = await request.json().catch(() => null) as {id?: unknown; name?: unknown; permissionIds?: unknown} | null;
    const rename = renameRoleSchema.safeParse(payload);
    const permissionsUpdate = updatePermissionsSchema.safeParse(payload);
    const update = rename.success
        ? {kind: "rename" as const, data: rename.data}
        : permissionsUpdate.success
            ? {kind: "permissions" as const, data: permissionsUpdate.data}
            : null;
    if (!update) {
        return Response.json({error: "Provide a valid role name or permission assignment."}, {status: 400});
    }

    const roleId = update.data.id;
    if (await isLockedRole(roleId)) {
        return Response.json({error: "The Super-Administrator role is locked and cannot be changed."}, {status: 409});
    }

    try {
        const found = await withPostgresTransaction(async (database) => {
            const role = await database.prepare("SELECT name FROM roles WHERE id = ?").get(roleId) as {name: string} | undefined;
            if (!role) return false;
            if (update.kind === "rename") {
                await database.prepare("UPDATE roles SET name = ? WHERE id = ?").run(update.data.name, roleId);
                await database.prepare(
                    `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                     VALUES (?, 'admin', 'staff_role.renamed', 'staff_role', ?, ?)`,
                ).run(randomUUID(), roleId, JSON.stringify({oldName: role.name, newName: update.data.name}));
                return true;
            }

            const permissionIds = [...new Set(update.data.permissionIds)];
            if (permissionIds.length) {
                const placeholders = permissionIds.map(() => "?").join(", ");
                const result = await database.prepare(`SELECT count(*) AS count FROM permissions WHERE id IN (${placeholders})`)
                    .get(...permissionIds) as {count: number};
                if (Number(result.count) !== permissionIds.length) {
                    throw new Error("Choose permissions that exist in the permission catalog.");
                }
            }
            await database.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(roleId);
            const assign = database.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
            for (const permissionId of permissionIds) await assign.run(roleId, permissionId);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'staff_role.permissions_updated', 'staff_role', ?, ?)`,
            ).run(randomUUID(), roleId, JSON.stringify({permissionCount: permissionIds.length}));
            return true;
        });
        if (!found) return Response.json({error: "Role was not found."}, {status: 404});
        return Response.json((await readRoles()).roles.find((role) => role.id === roleId));
    } catch (error) {
        if (isUniqueConstraint(error)) return Response.json({error: "A role with that name already exists."}, {status: 409});
        if (error instanceof Error && error.message.includes("permission catalog")) {
            return Response.json({error: error.message}, {status: 400});
        }
        console.error("Unable to update staff role:", error);
        return Response.json({error: "Role could not be updated in PostgreSQL."}, {status: 503});
    }
}

export async function DELETE(request: Request) {
    await connection();
    const parsed = deleteRoleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({error: "Choose a valid role."}, {status: 400});
    if (await isLockedRole(parsed.data.id)) {
        return Response.json({error: "The Super-Administrator role is locked and cannot be deleted."}, {status: 409});
    }

    try {
        const result = await withPostgresTransaction(async (database) => {
            const role = await database.prepare("SELECT name FROM roles WHERE id = ?").get(parsed.data.id) as {name: string} | undefined;
            if (!role) return {status: "missing" as const};
            const assigned = await database.prepare(
                "SELECT count(*) AS count FROM staff_user_roles WHERE role_id = ?",
            ).get(parsed.data.id) as {count: number};
            if (Number(assigned.count)) return {status: "assigned" as const, name: role.name, count: Number(assigned.count)};
            await database.prepare("DELETE FROM roles WHERE id = ?").run(parsed.data.id);
            await database.prepare(
                `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id, details)
                 VALUES (?, 'admin', 'staff_role.deleted', 'staff_role', ?, ?)`,
            ).run(randomUUID(), parsed.data.id, JSON.stringify({name: role.name}));
            return {status: "deleted" as const};
        });
        if (result.status === "missing") return Response.json({error: "Role was not found."}, {status: 404});
        if (result.status === "assigned") {
            return Response.json({
                error: `Cannot delete ${result.name}; it is assigned to ${result.count} user${result.count === 1 ? "" : "s"}.`,
            }, {status: 409});
        }
        return new Response(null, {status: 204});
    } catch (error) {
        console.error("Unable to delete staff role:", error);
        return Response.json({error: "Role could not be deleted from PostgreSQL."}, {status: 503});
    }
}
