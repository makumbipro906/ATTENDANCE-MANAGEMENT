// The staff session cookie name is shared between the proxy and the server modules.
//
// It lives in its own module because the proxy must not import server code: some hosts
// run the proxy as an Edge Function, where the PostgreSQL driver and the filesystem are
// unavailable. Importing the constant from its own module keeps the proxy bundle free of
// Node-only dependencies.
export const STAFF_SESSION_COOKIE = "orchid_staff_session";
