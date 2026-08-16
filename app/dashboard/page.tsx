import { DashboardClient } from "./dashboard-client";
import { getScrapeStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialStatus = await getScrapeStatus();
  return <DashboardClient initialStatus={initialStatus} />;
}
