import {Suspense} from "react";

import {StudentAttendanceSmsDashboardPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceSmsDashboardRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading SMS dashboard…</p></main>}>
        <StudentAttendanceSmsDashboardPage/>
    </Suspense>;
}
