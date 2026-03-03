import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const cookieStore = await cookies();
  const activeTeamCookie = cookieStore.get("active_team_id")?.value;
  const fallbackTeamId =
    session.user.activeTeamId ??
    session.user.teams[0]?.teamId;
  const activeTeamId = session.user.teams.some(
    (team) => team.teamId === activeTeamCookie,
  )
    ? activeTeamCookie
    : fallbackTeamId;

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1540px] gap-5 px-5 py-6 lg:grid-cols-[288px_1fr] lg:px-6">
      <DashboardSidebar />
      <main className="space-y-5">
        <DashboardHeader
          userName={session.user.name}
          teams={session.user.teams}
          activeTeamId={activeTeamId}
        />
        {children}
      </main>
    </div>
  );
}
