// Small shared presentational components used by both the setup wizard and
// the confirmation surface. Extracted from views.tsx (M0 setup-wizard
// rewrite) - needed as their own module to avoid a circular import between
// views.tsx and the new setup/ directory. Zero behavior change.

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { adminGateMessage, isUnsafeAdminError, localDevAdminWarning } from "./liveContext";
import type { LocalDevPlatformContext } from "../types";

export function AdminModeBanner({ errorMessage }: { errorMessage?: string }) {
  return (
    <Alert className="scheduling-admin-warning" variant={isUnsafeAdminError(errorMessage) ? "destructive" : "default"}>
      <AlertTitle>{isUnsafeAdminError(errorMessage) ? "Admin gate blocked." : "Local/dev admin mode."}</AlertTitle>
      <AlertDescription>{isUnsafeAdminError(errorMessage) ? adminGateMessage : localDevAdminWarning}</AlertDescription>
    </Alert>
  );
}

export function OwnershipSummary({ localDevContext }: { localDevContext: LocalDevPlatformContext }) {
  return (
    <aside className="scheduling-ownership" role="note">
      <strong>Local-dev owner:</strong> account <code>{localDevContext.accountId}</code> · Scheduling installation{" "}
      <code>{localDevContext.schedulingInstallation.appInstallationId.value}</code>. Ownership is assigned by the backend; do not enter account ids.
    </aside>
  );
}
