import { useEffect } from "react";
import { useAuth as useClerkAuth, useOrganizationList } from "@clerk/clerk-react";

export function useAutoSelectOrg() {
  const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  if (!clerkEnabled) return;

  const { isSignedIn, isLoaded, orgId } = useClerkAuth();
  const { isLoaded: membershipsReady, userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (!membershipsReady) return;
    if (userMemberships?.isLoading) return;
    if (orgId) return;

    const memberships = userMemberships?.data;
    if (!memberships?.length || !setActive) return;

    const firstOrgId = memberships[0]?.organization?.id;
    if (!firstOrgId) return;

    void setActive({ organization: firstOrgId }).catch((err: unknown) => {
      console.error("[AutoSelectOrg] setActive failed", err);
    });
  }, [isLoaded, isSignedIn, membershipsReady, orgId, userMemberships?.data, userMemberships?.isLoading, setActive]);
}
