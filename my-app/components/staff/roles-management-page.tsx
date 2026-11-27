"use client";

import {useEffect, useMemo, useRef, useState, type FormEvent} from "react";
import {Plus, ShieldCheck} from "lucide-react";

import {Button} from "@/components/ui/button";
import {SYSTEM_PERMISSIONS} from "@/lib/system-permissions";

type Permission = {id: string; permission_key: string; description: string};
type StaffRole = {
    id: string;
    name: string;
    description: string;
    userCount: number;
    locked: boolean;
    permissionCount: number;
    permissions: Permission[];
};
type RolesResponse = {roles: StaffRole[]; permissions: Permission[]};
type DialogMode = "add" | "rename" | "permissions" | null;

function rolePermissionCount(role: StaffRole, total: number) {
    return role.locked ? total : role.permissionCount;
}

export function RolesManagementPage() {
    const [roles, setRoles] = useState<StaffRole[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [roleName, setRoleName] = useState("");
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);

    async function requestRoles(signal?: AbortSignal) {
        const response = await fetch("/api/staff-roles", {cache: "no-store", signal});
        const payload = await response.json() as RolesResponse | {error?: string};
        if (!response.ok || !("roles" in payload) || !("permissions" in payload)) {
            throw new Error("error" in payload && payload.error ? payload.error : "Roles could not be loaded.");
        }
        return payload;
    }

    async function refreshRoles() {
        const payload = await requestRoles();
        setRoles(payload.roles);
        setPermissions(payload.permissions);
        return payload.roles;
    }

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const payload = await requestRoles(controller.signal);
                if (controller.signal.aborted) return;
                setRoles(payload.roles);
                setPermissions(payload.permissions);
            } catch (loadError) {
                if (!controller.signal.aborted) {
                    setError(loadError instanceof Error ? loadError.message : "Roles could not be loaded.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void load();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!dialogRef.current) return;
        if (dialogMode && !dialogRef.current.open) dialogRef.current.showModal();
        if (!dialogMode && dialogRef.current.open) dialogRef.current.close();
    }, [dialogMode]);

    const roleIndex = useMemo(() => new Map(roles.map((role, index) => [role.id, index + 1])), [roles]);

    function openAddRole() {
        setError("");
        setNotice("");
        setRoleName("");
        setSelectedRole(null);
        setDialogMode("add");
    }

    function openRename(role: StaffRole) {
        setError("");
        setNotice("");
        setRoleName(role.name);
        setSelectedRole(role);
        setDialogMode("rename");
    }

    function openPermissions(role: StaffRole) {
        setError("");
        setNotice("");
        setSelectedRole(role);
        setPermissionIds(role.locked ? permissions.map((item) => item.id) : role.permissions.map((item) => item.id));
        setDialogMode("permissions");
    }

    async function saveRole(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/staff-roles", {
                method: dialogMode === "add" ? "POST" : "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(dialogMode === "add"
                    ? {name: roleName}
                    : {id: selectedRole?.id, name: roleName}),
            });
            const payload = await response.json() as StaffRole | {error?: string};
            if (!response.ok || !("id" in payload)) {
                throw new Error("error" in payload && payload.error ? payload.error : "Role could not be saved.");
            }
            setDialogMode(null);
            setSelectedRole(null);
            setNotice(`“${payload.name}” was ${dialogMode === "add" ? "created" : "renamed"}.`);
            await refreshRoles();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Role could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    async function savePermissions(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedRole) return;
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/staff-roles", {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id: selectedRole.id, permissionIds}),
            });
            const payload = await response.json() as StaffRole | {error?: string};
            if (!response.ok || !("id" in payload)) {
                throw new Error("error" in payload && payload.error ? payload.error : "Permissions could not be saved.");
            }
            setDialogMode(null);
            setSelectedRole(null);
            setNotice(`Permissions updated for “${payload.name}”.`);
            await refreshRoles();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Permissions could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteRole(role: StaffRole) {
        if (role.locked || !window.confirm(`Delete the “${role.name}” role? This cannot be undone.`)) return;
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/staff-roles", {
                method: "DELETE",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id: role.id}),
            });
            if (!response.ok) {
                const payload = await response.json() as {error?: string};
                throw new Error(payload.error || "Role could not be deleted.");
            }
            setNotice(`“${role.name}” was deleted.`);
            await refreshRoles();
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Role could not be deleted.");
        }
    }

    function togglePermission(permissionId: string) {
        setPermissionIds((current) => current.includes(permissionId)
            ? current.filter((id) => id !== permissionId)
            : [...current, permissionId]);
    }

    const title = dialogMode === "rename" ? "Rename Role" :
        dialogMode === "permissions" ? `Permissions — ${selectedRole?.name ?? ""}` : "Add Role";

    return (
        <main className="page-content staff-management-page roles-management-page">
            <header className="staff-users-page-heading">
                <div>
                    <h1 className="page-title">Roles &amp; Permissions</h1>
                    <p className="page-description">Define roles and what each can access across the system.</p>
                </div>
                <Button className="staff-add-user-button staff-add-role-button" onClick={openAddRole} type="button">
                    <Plus aria-hidden="true" size={15}/>Add Role
                </Button>
            </header>

            {error && !dialogMode && <p className="student-form-error" role="alert">{error}</p>}
            {notice && <p aria-live="polite" className="student-notice">{notice}</p>}

            <section aria-label="Roles" className="card staff-users-card roles-list-card">
                <div className="roles-list-heading"><h2>Roles</h2></div>
                <div className="table-wrap staff-users-table-wrap roles-table-wrap">
                    <table className="data-table roles-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Role</th>
                                <th scope="col">Permissions</th>
                                <th scope="col"><span className="visually-hidden">Role actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role) => (
                                <tr key={role.id}>
                                    <td>{roleIndex.get(role.id)}</td>
                                    <td>{role.name}</td>
                                    <td>
                                        <span className={`role-permission-badge${role.locked ? " locked" : ""}`}>
                                            {role.locked ? "All (Locked)" : `${rolePermissionCount(role, permissions.length)} Granted`}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="role-row-actions">
                                            <Button className="role-permissions-button" onClick={() => openPermissions(role)} size="sm" type="button" variant="outline">
                                                <ShieldCheck aria-hidden="true" size={13}/>Permissions
                                            </Button>
                                            {!role.locked && (
                                                <>
                                                    <Button className="role-rename-button" onClick={() => openRename(role)} size="sm" type="button" variant="outline">Rename</Button>
                                                    <Button className="role-delete-button" onClick={() => void deleteRole(role)} size="sm" type="button" variant="outline">Delete</Button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && roles.length === 0 && (
                                <tr><td className="empty-table-state" colSpan={4}>No roles have been configured.</td></tr>
                            )}
                            {loading && <tr><td className="empty-table-state" colSpan={4}>Loading roles…</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            <dialog
                className={`student-dialog staff-user-dialog role-dialog${dialogMode === "permissions" ? " role-permissions-dialog" : ""}`}
                onClose={() => {
                    setDialogMode(null);
                    setSelectedRole(null);
                    setError("");
                }}
                ref={dialogRef}
            >
                <div className="student-dialog-heading staff-user-dialog-heading">
                    <h2>{title}</h2>
                    <Button aria-label="Close role dialog" className="staff-user-close-button" onClick={() => {
                        setDialogMode(null);
                        setSelectedRole(null);
                    }} type="button" variant="ghost"><span aria-hidden="true">×</span></Button>
                </div>

                {(dialogMode === "add" || dialogMode === "rename") && (
                    <form className="role-form" onSubmit={saveRole}>
                        <label className="student-form-field">
                            <span>Role name <span className="staff-user-required">*</span></span>
                            <input
                                autoFocus
                                maxLength={100}
                                onChange={(event) => setRoleName(event.target.value)}
                                placeholder="e.g. Librarian, Bursar, Dean"
                                required
                                value={roleName}
                            />
                        </label>
                        {error && <p className="student-form-error" role="alert">{error}</p>}
                        <div className="role-form-actions">
                            <Button className="staff-user-cancel-button" onClick={() => setDialogMode(null)} type="button" variant="outline">Cancel</Button>
                            <Button className="staff-user-submit-button" disabled={saving} type="submit">{saving ? "Saving..." : "Save"}</Button>
                        </div>
                    </form>
                )}

                {dialogMode === "permissions" && selectedRole && (
                    <form className="role-form role-permissions-form" onSubmit={savePermissions}>
                        {selectedRole.locked ? (
                            <p className="role-locked-note">Super-Administrator has all configured permissions and cannot be changed.</p>
                        ) : (
                            <div className="role-permission-groups">
                                {Array.from(new Set(SYSTEM_PERMISSIONS.map(({module}) => module))).map((module) => (
                                    <fieldset className="role-permission-group" key={module}>
                                        <legend>{module}</legend>
                                        {SYSTEM_PERMISSIONS.filter((item) => item.module === module).map((item) => {
                                            const permission = permissions.find(({permission_key}) => permission_key === item.key);
                                            if (!permission) return null;
                                            return (
                                                <label key={permission.id}>
                                                    <input checked={permissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} type="checkbox"/>
                                                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                                                </label>
                                            );
                                        })}
                                    </fieldset>
                                ))}
                            </div>
                        )}
                        {error && <p className="student-form-error" role="alert">{error}</p>}
                        <div className="role-form-actions">
                            <Button className="staff-user-cancel-button" onClick={() => setDialogMode(null)} type="button" variant="outline">Cancel</Button>
                            {!selectedRole.locked && <Button className="staff-user-submit-button" disabled={saving} type="submit">{saving ? "Saving..." : "Save"}</Button>}
                        </div>
                    </form>
                )}

            </dialog>
        </main>
    );
}
