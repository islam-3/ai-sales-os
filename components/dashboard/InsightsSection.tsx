import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "./BarList";
import { TopEntry } from "@/lib/dashboard";

export function InsightsSection({
  concernEntries,
  serviceEntries,
}: {
  concernEntries: TopEntry[];
  serviceEntries: TopEntry[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-900">
            Most Common Concerns &amp; Objections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarList entries={concernEntries} />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-900">
            Most Requested Services &amp; Treatments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarList entries={serviceEntries} />
        </CardContent>
      </Card>
    </div>
  );
}
