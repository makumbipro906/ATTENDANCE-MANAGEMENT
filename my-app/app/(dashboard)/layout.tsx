import type {ReactNode} from "react";
import {SchoolDashboardLayout} from "../../components/layout/school-dashboard-layout";

export const instant = false;

export default function SchoolLayout({children}: { children: ReactNode }) {
    return <SchoolDashboardLayout>{children}</SchoolDashboardLayout>;
}
