import {redirect} from "next/navigation";

export default function FailedSmsRoute() {
    redirect("/student-attendance/sms-dashboard");
}
