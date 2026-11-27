import {Suspense} from "react";

import {StudentAttendanceRecordsPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceRecordsRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading attendance records…</p></main>}>
        <StudentAttendanceRecordsPage/>
    </Suspense>;
}
