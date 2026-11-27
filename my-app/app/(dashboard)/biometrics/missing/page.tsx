import {connection} from "next/server";
import {ManagementPage} from "../../../../components/management-page";
import {getBiometricManagementRows} from "../../../../lib/server/management-data";

export default async function BiometricsMissingPage() {
    await connection();
    const rows = await getBiometricManagementRows("Pending");
    return <ManagementPage
        title="Biometrics missing"
        description="Students with an incomplete biometric profile."
        tabs={[
            {label: "All students", href: "/biometrics"},
            {label: "Complete", href: "/biometrics/complete"},
            {label: "Missing", href: "/biometrics/missing", active: true},
        ]}
        rows={rows}
    />;
}
