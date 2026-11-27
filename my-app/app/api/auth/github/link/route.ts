import {cookies} from "next/headers";
import {connection} from "next/server";
import {NextResponse} from "next/server";

import {
    createGithubAuthorizationUrl,
    createGithubOAuthState,
    GITHUB_OAUTH_STATE_COOKIE,
    GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
    isGithubOAuthConfigured,
} from "@/lib/server/github-oauth";
import {
    getStaffSession,
    isSafeSameOriginRequest,
    STAFF_SESSION_COOKIE,
} from "@/lib/server/staff-auth";

const stateCookieOptions = {
    httpOnly: true,
    maxAge: GITHUB_OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/api/auth/github/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
};

export async function POST(request: Request) {
    await connection();
    if (!isSafeSameOriginRequest(request)) {
        return Response.json({error: "Request origin is not allowed."}, {status: 403});
    }
    if (!isGithubOAuthConfigured()) {
        return Response.json({error: "GitHub sign-in is not configured."}, {status: 503});
    }

    try {
        const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
        const session = await getStaffSession(token);
        if (!session) return Response.json({error: "Sign in again before linking GitHub."}, {status: 401});
        if (!session.roleNames.some((name) => name.toLocaleLowerCase() === "super-administrator")) {
            return Response.json({error: "Only Super-Administrators can link GitHub."}, {status: 403});
        }

        const state = await createGithubOAuthState("link", session.id);
        const response = NextResponse.json({authorizationUrl: createGithubAuthorizationUrl(state)});
        response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, stateCookieOptions);
        return response;
    } catch (error) {
        console.error("Unable to start GitHub account linking:", error);
        return Response.json({error: "GitHub account linking could not be started."}, {status: 503});
    }
}
