"use client";

import {useEffect, useMemo, useRef, useState, type FormEvent} from "react";
import {Plus, Search} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";

type StaffRole = {id: string; name: string};
type StaffUser = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    phone: string;
    roleNames: string[];
    roleIds: string[];
    active: boolean;
    createdAt: string;
    credentialsConfigured: boolean;
};
type UserPayload = {users: StaffUser[]; roles: StaffRole[]};
type UserForm = Omit<StaffUser, "id" | "roleNames" | "active" | "createdAt" | "credentialsConfigured">;

const emptyForm: UserForm = {
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    roleIds: [],
};

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("en-CA", {timeZone: "UTC"});
}

export function UserManagementPage() {
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [roles, setRoles] = useState<StaffRole[]>([]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
    const [dialogUser, setDialogUser] = useState<StaffUser | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<UserForm>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const dialogRef = useRef<HTMLDialogElement>(null);

    async function requestUsers(signal?: AbortSignal) {
        const response = await fetch("/api/staff-users", {cache: "no-store", signal});
        const payload = await response.json() as UserPayload | {error?: string};
        if (!response.ok || !("users" in payload) || !("roles" in payload)) {
            throw new Error("error" in payload && payload.error ? payload.error : "Staff users could not be loaded.");
        }
        return payload;
    }

    async function loadUsers() {
        const payload = await requestUsers();
        setUsers(payload.users);
        setRoles(payload.roles);
    }

    useEffect(() => {
        const controller = new AbortController();
        async function loadInitialUsers() {
            try {
                const payload = await requestUsers(controller.signal);
                if (controller.signal.aborted) return;
                setUsers(payload.users);
                setRoles(payload.roles);
            } catch (loadError) {
                if (!controller.signal.aborted) {
                    setError(loadError instanceof Error ? loadError.message : "Staff users could not be loaded.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        void loadInitialUsers();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!dialogRef.current) return;
        if (dialogOpen && !dialogRef.current.open) dialogRef.current.showModal();
        if (!dialogOpen && dialogRef.current.open) dialogRef.current.close();
    }, [dialogOpen]);

    const visibleUsers = useMemo(() => {
        const normalized = search.trim().toLocaleLowerCase();
        return users.filter((user) => {
            const searchable = [
                user.firstName, user.lastName, user.username, user.email, user.phone, ...user.roleNames,
            ].join(" ").toLocaleLowerCase();
            return (!normalized || searchable.includes(normalized)) &&
                (!roleFilter || user.roleIds.includes(roleFilter)) &&
                (statusFilter === "all" || user.active === (statusFilter === "active"));
        });
    }, [roleFilter, search, statusFilter, users]);

    function openAddDialog() {
        setError("");
        setForm(emptyForm);
        setDialogUser(null);
        setDialogOpen(true);
    }

    function openEditDialog(user: StaffUser) {
        setError("");
        setForm({
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            email: user.email,
            phone: user.phone,
            roleIds: user.roleIds,
        });
        setDialogUser(user);
        setDialogOpen(true);
    }

    async function saveUser(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/staff-users", {
                method: dialogUser ? "PUT" : "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({...form, ...(dialogUser ? {id: dialogUser.id} : {})}),
            });
            const payload = await response.json() as StaffUser | {error?: string};
            if (!response.ok || !("id" in payload)) {
                throw new Error("error" in payload && payload.error ? payload.error : "Staff user could not be saved.");
            }
            setDialogOpen(false);
            setDialogUser(null);
            setNotice(dialogUser
                ? `${payload.firstName} ${payload.lastName} was updated.`
                : `${payload.firstName} ${payload.lastName} was added. An activation code was sent by SMS.`);
            await loadUsers();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Staff user could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleStatus(user: StaffUser) {
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/staff-users", {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id: user.id, active: !user.active}),
            });
            const payload = await response.json() as StaffUser | {error?: string};
            if (!response.ok || !("id" in payload)) {
                throw new Error("error" in payload && payload.error ? payload.error : "User status could not be changed.");
            }
            setNotice(`${payload.firstName} ${payload.lastName} is now ${payload.active ? "active" : "inactive"}.`);
            await loadUsers();
        } catch (statusError) {
            setError(statusError instanceof Error ? statusError.message : "User status could not be changed.");
        }
    }

    async function resendActivation(user: StaffUser) {
        setError("");
        setNotice("");
        try {
            const response = await fetch("/api/staff-users/activation-code", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id: user.id}),
            });
            const payload = await response.json() as {error?: string; maskedPhone?: string};
            if (!response.ok) throw new Error(payload.error || "Activation code could not be sent.");
            setNotice(`A new activation code was sent to ${payload.maskedPhone ?? "the registered phone"}.`);
        } catch (resendError) {
            setError(resendError instanceof Error ? resendError.message : "Activation code could not be sent.");
        }
    }

    const activeCount = users.filter((user) => user.active).length;

    return (
        <main className="page-content staff-management-page user-management-page">
            <header className="staff-users-page-heading">
                <div>
                    <div className="eyebrow">Administration</div>
                    <h1 className="page-title">User Management</h1>
                    <p className="page-description">Manage staff users and their access.</p>
                </div>
                <Button className="button-primary staff-add-user-button" onClick={openAddDialog} type="button">
                    <Plus aria-hidden="true" size={15}/>Add User
                </Button>
            </header>

            {error && !dialogOpen && <p className="student-form-error" role="alert">{error}</p>}
            {notice && <p aria-live="polite" className="student-notice">{notice}</p>}

            <section aria-label="Users" className="card staff-users-card">
                <div className="staff-users-toolbar">
                    <div>
                        <h2 className="card-title">Users</h2>
                        <p className="card-subtitle">{visibleUsers.length} shown · {activeCount} active</p>
                    </div>
                    <label className="staff-users-search">
                        <Search aria-hidden="true" size={15}/>
                        <span className="visually-hidden">Search users</span>
                        <input
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search users..."
                            type="search"
                            value={search}
                        />
                    </label>
                </div>
                <div className="staff-users-filters">
                    <label>
                        <span className="visually-hidden">Filter users by role</span>
                        <select onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
                            <option value="">All roles</option>
                            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className="visually-hidden">Filter users by status</span>
                        <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </label>
                </div>
                <div className="table-wrap staff-users-table-wrap">
                    <table className="data-table staff-users-table">
                        <thead>
                            <tr>
                                <th scope="col">SN</th>
                                <th scope="col">Name</th>
                                <th scope="col">Username</th>
                                <th scope="col">Email</th>
                                <th scope="col">Phone</th>
                                <th scope="col">Role</th>
                                <th scope="col">Status</th>
                                <th scope="col">Account Setup</th>
                                <th scope="col">Date Added</th>
                                <th scope="col">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleUsers.map((user, index) => (
                                <tr key={user.id}>
                                    <td>{index + 1}</td>
                                    <td>{user.firstName} {user.lastName}</td>
                                    <td>{user.username || "—"}</td>
                                    <td>{user.email || "—"}</td>
                                    <td>{user.phone || "—"}</td>
                                    <td>{user.roleNames.length ? user.roleNames.join(", ") : "No role assigned"}</td>
                                    <td><Badge className={`status-pill ${user.active ? "active" : "inactive"}`} variant="outline">{user.active ? "Active" : "Inactive"}</Badge></td>
                                    <td><span className={`staff-credentials-state${user.credentialsConfigured ? "" : " not-configured"}`}>{user.credentialsConfigured ? "Active" : "Activation pending"}</span></td>
                                    <td>{formatDate(user.createdAt)}</td>
                                    <td>
                                        <div className="staff-user-actions">
                                            <Button className="staff-user-edit-button" onClick={() => openEditDialog(user)} size="sm" type="button" variant="outline">Edit</Button>
                                            {!user.credentialsConfigured && user.active && (
                                                <Button onClick={() => void resendActivation(user)} size="sm" type="button" variant="outline">Resend code</Button>
                                            )}
                                            <Button
                                                className={user.active ? "staff-user-deactivate-button" : "staff-user-activate-button"}
                                                onClick={() => void toggleStatus(user)}
                                                size="sm"
                                                type="button"
                                                variant="outline"
                                            >
                                                {user.active ? "Deactivate" : "Activate"}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && visibleUsers.length === 0 && (
                                <tr><td className="empty-table-state" colSpan={10}>
                                    {users.length ? "No users match these filters." : "No staff users have been added yet."}
                                </td></tr>
                            )}
                            {loading && <tr><td className="empty-table-state" colSpan={10}>Loading users…</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="staff-users-footer">
                    <span>Showing {visibleUsers.length} of {users.length} users</span>
                    <span>Passwords are securely hashed and never displayed.</span>
                </div>
            </section>

            <dialog
                className="student-dialog staff-user-dialog"
                onClose={() => {
                    setDialogOpen(false);
                    setDialogUser(null);
                    setError("");
                }}
                ref={dialogRef}
            >
                <div className="student-dialog-heading staff-user-dialog-heading">
                    <h2>{dialogUser ? "Edit User" : "Add User"}</h2>
                    <Button aria-label="Close user form" onClick={() => {
                        setDialogOpen(false);
                        setDialogUser(null);
                    }} className="staff-user-close-button" type="button" variant="ghost"><span aria-hidden="true">×</span></Button>
                </div>
                <form className="staff-user-form" onSubmit={saveUser}>
                    <div className="staff-user-form-grid">
                        <label className="student-form-field">
                            <span>First Name <span className="staff-user-required">*</span></span>
                            <input autoComplete="given-name" maxLength={100} required value={form.firstName}
                                   onChange={(event) => setForm({...form, firstName: event.target.value})}/>
                        </label>
                        <label className="student-form-field">
                            <span>Last Name <span className="staff-user-required">*</span></span>
                            <input autoComplete="family-name" maxLength={100} required value={form.lastName}
                                   onChange={(event) => setForm({...form, lastName: event.target.value})}/>
                        </label>
                        <label className="student-form-field">
                            <span>Username <span className="staff-user-required">*</span></span>
                            <input autoComplete="username" className="staff-user-form-wide" maxLength={80} pattern="[A-Za-z0-9._-]+" required value={form.username}
                                   onChange={(event) => setForm({...form, username: event.target.value})}/>
                        </label>
                        <label className="student-form-field">
                            <span>Role <span className="staff-user-required">*</span></span>
                            <select
                                className="staff-user-form-wide"
                                onChange={(event) => setForm({...form, roleIds: event.target.value ? [event.target.value] : []})}
                                required
                                value={form.roleIds[0] ?? ""}
                            >
                                <option disabled value="">{roles.length ? "Select role..." : "No roles configured"}</option>
                                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                            {roles.length === 0 && <small>Add a role in the Roles section before creating a user.</small>}
                        </label>
                        {!dialogUser && <p className="staff-user-form-wide">The user will receive a five-minute activation code by SMS and create their own permanent password.</p>}
                        <label className="student-form-field">
                            <span>Email <span className="staff-user-optional">(optional)</span></span>
                            <input autoComplete="email" className="staff-user-form-wide" maxLength={254} type="email" value={form.email}
                                   onChange={(event) => setForm({...form, email: event.target.value})}/>
                        </label>
                        <label className="student-form-field">
                            <span>Phone <span className="staff-user-required">*</span></span>
                            <input autoComplete="tel" className="staff-user-form-wide" maxLength={32} placeholder="+2567XXXXXXXX" required type="tel" value={form.phone}
                                   onChange={(event) => setForm({...form, phone: event.target.value})}/>
                        </label>
                    </div>
                    {error && <p className="student-form-error" role="alert">{error}</p>}
                    <div className="staff-user-form-actions">
                        <Button className="staff-user-cancel-button" onClick={() => {
                            setDialogOpen(false);
                            setDialogUser(null);
                        }} type="button" variant="outline">Cancel</Button>
                        <Button className="staff-user-submit-button" disabled={saving} type="submit">
                            {saving ? "Saving..." : dialogUser ? "Save changes" : "Add User"}
                        </Button>
                    </div>
                </form>
            </dialog>
        </main>
    );
}
