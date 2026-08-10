import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks, Target, TrendingUp, Users } from "lucide-react";
import { DashboardKpis, STATUS_OPTIONS, STATUS_META } from "@/lib/dashboard";

export function StatCards({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            {kpis.totalLeads}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpis.todayCount} today &middot; {kpis.thisWeekCount} this week &middot;{" "}
            {kpis.thisMonthCount} this month
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg. Qualification Score
          </CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            {kpis.avgScore ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Out of 100</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Conversion Rate
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            {kpis.conversionRate}%
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Leads marked converted</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Status</CardTitle>
          <ListChecks className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {STATUS_OPTIONS.map((status) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
              </span>
              <span className="font-medium text-slate-900">{kpis.statusCounts[status]}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
