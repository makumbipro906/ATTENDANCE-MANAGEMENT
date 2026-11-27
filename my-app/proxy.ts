import {NextRequest, NextResponse} from "next/server";

import {getPermissionForPath, type SystemPermissionKey} from "@/lib/system-permissions";

/**
 * The proxy is the only place that enforces module permissions, so it must not import
 * Node-only modules: some hosts run the proxy as an Edge Function, where the PostgreSQL
 * driver and the filesystem are unavailable. The setup and session lookups therefore run in
 * a Node.js route handler that the proxy calls at most once per request.
 */
const PROXY_AUTH_PATH = "/api/internal/proxy-auth";

type ProxyAuthState = {
    setupRequired: boolean;
    session: {permissions: SystemPermissionKey[]} | null;
};

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
    console.error("Authentication proxy could not reach the database:", error);
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

/**
 * Loads the caller's setup and session state from the Node.js auth route. The lookup runs
 * at most once per request, even though the proxy needs the state in several branches.
 */
function createAuthLoader(request: NextRequest) {
    let pending: Promise<ProxyAuthState> | null = null;
    return () => {
        pending ??= (async () => {
            const response = await fetch(new URL(PROXY_AUTH_PATH, request.url), {
                headers: {cookie: request.headers.get("cookie") ?? ""},
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`The authentication route answered with status ${response.status}.`);
            }
            return await response.json() as ProxyAuthState;
        })();
        return pending;
    };
}

export async function proxy(request: NextRequest) {
    const {pathname} = request.nextUrl;
    if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" ||
        pathname === "/api/health" ||
        // The proxy calls this route itself, so it must never be intercepted again.
        pathname.startsWith(PROXY_AUTH_PATH) ||
        pathname.startsWith("/api/internal/sms/dispatch") || pathname.startsWith("/api/device-events") ||
        /\.(?:svg|png|jpe?g|webp|gif|ico)$/i.test(pathname)) return NextResponse.next();
    if (pathname === "/initial-setup") return NextResponse.redirect(new URL("/login", request.url));

    const loadAuth = createAuthLoader(request);

    let authState: ProxyAuthState;
    try {
        authState = await loadAuth();
    } catch (error) {
        return serviceUnavailableResponse(request, error);
    }
    const {setupRequired, session} = authState;
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
        if (session && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
        return NextResponse.next();
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
