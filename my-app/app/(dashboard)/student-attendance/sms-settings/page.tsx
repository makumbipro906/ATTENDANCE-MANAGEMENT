import {Suspense} from "react";

import {StudentAttendanceSmsSettingsPage} from "@/components/student-attendance/student-attendance-pages";

export default function StudentAttendanceSmsSettingsRoute() {
    return <Suspense fallback={<main className="page-content student-attendance-page"><p>Loading SMS settings…</p></main>}>
        <StudentAttendanceSmsSettingsPage/>
    </Suspense>;
}
