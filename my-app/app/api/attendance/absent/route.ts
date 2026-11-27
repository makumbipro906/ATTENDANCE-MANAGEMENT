import {connection} from "next/server";
import {getAbsentReport} from "@/lib/server/attendance-report-handlers";

export async function GET(request: Request) {
    await connection();
    return getAbsentReport(request);
}
