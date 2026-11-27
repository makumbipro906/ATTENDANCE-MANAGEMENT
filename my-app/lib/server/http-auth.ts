import "server-only";

import { timingSafeEqual } from "node:crypto";

export function hasValidSecret(request: Request, headerName: string, envName: string) {
  const expected = process.env[envName];
  const provided = request.headers.get(headerName);
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}
