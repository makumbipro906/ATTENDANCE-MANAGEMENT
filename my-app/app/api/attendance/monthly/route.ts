import {connection} from "next/server";
import {getPeriodReport} from "@/lib/server/attendance-report-handlers";

export async function GET(request: Request) {
    await connection();
    return getPeriodReport(request, "monthly");
}
