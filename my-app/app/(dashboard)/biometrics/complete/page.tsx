import {connection} from "next/server";
import {ManagementPage} from "../../../../components/management-page";
import {getBiometricManagementRows} from "../../../../lib/server/management-data";

export default async function BiometricsCompletePage() {
    await connection();
    const rows = await getBiometricManagementRows("Complete");
    return <ManagementPage
        title="Biometrics complete"
        description="Students with a complete biometric profile."
        tabs={[
            {label: "All students", href: "/biometrics"},
            {label: "Complete", href: "/biometrics/complete", active: true},
            {label: "Missing", href: "/biometrics/missing"},
        ]}
        rows={rows}
    />;
}
