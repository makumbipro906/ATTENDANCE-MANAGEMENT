import {Suspense, type ReactNode} from "react";
import {DashboardShell} from "./dashboard-shell";
import {StudentRecordsProvider} from "../students/student-records-provider";
import {AcademicYearsProvider} from "../settings/academic-years-provider";
import {SchoolStructureProvider} from "../settings/school-structure-provider";
import {UserProfileProvider} from "../user-profile-provider";

export function SchoolDashboardLayout({children}: {children: ReactNode}) {
    return (
        <AcademicYearsProvider>
            <SchoolStructureProvider>
                <StudentRecordsProvider>
                    <UserProfileProvider>
                        <Suspense fallback={<div className="dashboard-shell"><main>{children}</main></div>}>
                            <DashboardShell>{children}</DashboardShell>
                        </Suspense>
                    </UserProfileProvider>
                </StudentRecordsProvider>
            </SchoolStructureProvider>
        </AcademicYearsProvider>
    );
}