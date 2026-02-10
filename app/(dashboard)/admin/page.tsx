import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import MarketingAdminCard from "@/components/MarketingAdminCard";
import OrganizationsAdminCard from "@/components/OrganizationsAdminCard";

export default async function AdminPage() {
  const email = await getCurrentUserEmail();

  if (!email?.endsWith("@streetsmartbuildings.com")) {
    redirect("/live");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-gray-500">
          Manage marketing, leads, and platform settings
        </p>
      </div>

      <MarketingAdminCard userEmail={email} />
      <OrganizationsAdminCard />
    </div>
  );
}
