import {Suspense} from "react";

import {StudentAttendanceDailyPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceDailyRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading daily attendance…</p></main>}>
        <StudentAttendanceDailyPage/>
    </Suspense>;
}
