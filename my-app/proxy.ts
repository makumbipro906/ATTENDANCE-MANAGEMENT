import {NextRequest, NextResponse} from "next/server";

import {getPermissionForPath} from "@/lib/system-permissions";
import {getStaffSession, isInitialSetupRequired, STAFF_SESSION_COOKIE} from "@/lib/server/staff-auth";

const publicApiPaths = new Set([
    "/api/auth/login",
    "/api/auth/verify-otp",
    "/api/auth/resend-otp",
    "/api/auth/forgot-password",
    "/api/auth/verify-password-reset",
    "/api/auth/set-password",
    "/api/auth/logout",
    "/api/auth/setup",
    "/api/auth/github/login",
    "/api/auth/github/callback",
    "/api/auth/github/status",
    "/api/health",
    "/api/internal/sms/dispatch",
    "/api/device-events",
]);

const apiPermissions: Record<string, ReturnType<typeof getPermissionForPath>> = {
    "/api/analytics": "dashboard.view",
    "/api/attendance": "attendance.view",
    "/api/student-attendance": "student_attendance.view",
    "/api/students": "students.view",
    "/api/school-settings": "school_settings.view",
    "/api/staff-users": "staff_users.view",
    "/api/staff-roles": "roles.view",
    "/api/staff-permissions": "roles.view",
    "/api/device-events": "biometrics.view",
};

function permissionForApi(pathname: string) {
    const prefix = Object.keys(apiPermissions)
        .sort((first, second) => second.length - first.length)
        .find((item) => pathname === item || pathname.startsWith(`${item}/`));
    if (prefix) return apiPermissions[prefix];
    return null;
}

function forbiddenResponse(request: NextRequest, message: string, status: number) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({error: message}, {status});
    }
    if (status === 401) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(loginUrl);
    }
    const deniedUrl = new URL("/access-denied", request.url);
    deniedUrl.searchParams.set("module", request.nextUrl.pathname);
    return NextResponse.redirect(deniedUrl);
}

function serviceUnavailableResponse(request: NextRequest, error: unknown) {
    console.error("Authentication proxy could not access the database:", error);
    if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
            {error: "Authentication services are temporarily unavailable."},
            {status: 503, headers: {"Retry-After": "30"}},
        );
    }
    return new NextResponse("Service temporarily unavailable.", {
        status: 503,
        headers: {"Retry-After": "30"},
    });
}

export async function proxy(request: NextRequest) {
    const {pathname} = request.nextUrl;
    if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" ||
        pathname === "/api/health" ||
        pathname.startsWith("/api/internal/sms/dispatch") || pathname.startsWith("/api/device-events") ||
        /\.(?:svg|png|jpe?g|webp|gif|ico)$/i.test(pathname)) return NextResponse.next();
    if (pathname === "/initial-setup") return NextResponse.redirect(new URL("/login", request.url));

    let setupRequired: boolean;
    try {
        setupRequired = await isInitialSetupRequired();
    } catch (error) {
        return serviceUnavailableResponse(request, error);
    }
    if (setupRequired) {
        if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/api/auth/setup" || pathname === "/api/health") {
            return NextResponse.next();
        }
        if (pathname.startsWith("/api/")) {
            return NextResponse.json({error: "Complete administrator setup before using the system."}, {status: 503});
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (publicApiPaths.has(pathname) || pathname === "/login" || pathname === "/forgot-password") {
        let session;
        try {
            session = await getStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value);
        } catch (error) {
            return serviceUnavailableResponse(request, error);
        }
        if (session && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
        return NextResponse.next();
    }

    let session;
    try {
        session = await getStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value);
    } catch (error) {
        return serviceUnavailableResponse(request, error);
    }
    if (!session) return forbiddenResponse(request, "Sign in to continue.", 401);

    const requiredPermission = pathname.startsWith("/api/")
        ? permissionForApi(pathname)
        : getPermissionForPath(pathname);
    if (requiredPermission && !session.permissions.includes(requiredPermission)) {
        return forbiddenResponse(request, "Your role does not have access to this module.", 403);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
