export const SYSTEM_PERMISSIONS = [
    {key: "dashboard.view", label: "Dashboard", description: "Open the school dashboard.", module: "Main"},
    {key: "students.view", label: "Students management", description: "View and manage student records.", module: "Main"},
    {key: "student_attendance.view", label: "Students attendance", description: "Manage daily attendance records, SMS settings, and attendance settings.", module: "Main"},
    {key: "attendance.view", label: "Attendance reports", description: "View attendance and absent-student reports.", module: "Main"},
    {key: "biometrics.view", label: "Biometrics tracking", description: "View and update student biometrics.", module: "Main"},
    {key: "contacts.view", label: "Contacts tracking", description: "View and update student contact records.", module: "Main"},
    {key: "classes.view", label: "Classes, streams & sections", description: "Manage school class structure.", module: "School setup"},
    {key: "years.view", label: "Academic years", description: "Manage academic years.", module: "School setup"},
    {key: "terms.view", label: "Terms", description: "Manage academic terms.", module: "School setup"},
    {key: "school_settings.view", label: "School settings", description: "View and update school-wide settings.", module: "School setup"},
    {key: "staff_users.view", label: "User management", description: "Manage staff user accounts and assignments.", module: "Administration"},
    {key: "roles.view", label: "Roles & permissions", description: "Manage roles and access permissions.", module: "Administration"},
    {key: "audit_log.view", label: "Audit log", description: "Review the system audit log.", module: "Other"},
] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSIONS)[number]["key"];

const permissionByRoute = [
    ["/Dashboard/users", "staff_users.view"],
    ["/Dashboard/roles", "roles.view"],
    ["/student-attendance", "student_attendance.view"],
    ["/students", "students.view"],
    ["/attendance", "attendance.view"],
    ["/alerts", "attendance.view"],
    ["/biometrics", "biometrics.view"],
    ["/contacts", "contacts.view"],
    ["/settings/classes", "classes.view"],
    ["/settings/streams", "classes.view"],
    ["/settings/sections", "classes.view"],
    ["/settings/years", "years.view"],
    ["/settings/terms", "terms.view"],
    ["/settings", "school_settings.view"],
    ["/sms", "student_attendance.view"],
    ["/audit-log", "audit_log.view"],
    ["/profile", null],
    ["/", "dashboard.view"],
] as const;

export function getPermissionForPath(pathname: string): SystemPermissionKey | null {
    for (const [prefix, permission] of permissionByRoute) {
        if (prefix === "/") {
            if (pathname === "/") return permission;
        } else if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
            return permission;
        }
    }
    return null;
}
