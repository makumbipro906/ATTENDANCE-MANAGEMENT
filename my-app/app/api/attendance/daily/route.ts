import {connection} from "next/server";
import {getDailyReport} from "@/lib/server/attendance-report-handlers";

export async function GET(request: Request) {
    await connection();
    return getDailyReport(request);
}
