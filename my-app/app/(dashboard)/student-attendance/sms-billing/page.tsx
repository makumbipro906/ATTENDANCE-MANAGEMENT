import {Suspense} from "react";

import {StudentAttendanceSmsBillingPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceSmsBillingRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading SMS billing…</p></main>}>
        <StudentAttendanceSmsBillingPage/>
    </Suspense>;
}
