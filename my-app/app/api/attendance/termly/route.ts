import {connection} from "next/server";
import {getTermlyReport} from "@/lib/server/attendance-report-handlers";

export async function GET(request: Request) {
    await connection();
    return getTermlyReport(request);
}
