"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadCard } from "./LeadCard";
import { LeadProfile, LeadStatus, STATUS_META, STATUS_OPTIONS } from "@/lib/dashboard";
import { LanguagePicker } from "./LanguagePicker";
import { resolveLanguageCode } from "@/lib/languages";

type StatusFilter = "all" | LeadStatus;

export function LeadsSection({ leads }: { leads: LeadProfile[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Lets a rep pull their own leads instead of waiting to be handed them.
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  // Languages that actually have leads, with counts, so the picker can
  // put them on top. The stored value may be a code or - for a lead
  // written before codes existed - a name, so both resolve to a code
  // here and a filter matches either.
  const withLeads = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const code = resolveLanguageCode(lead.qualification_data?.visitor_language);
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return Array.from(counts, ([code, count]) => ({ code, count })).sort(
      (a, b) => b.count - a.count || a.code.localeCompare(b.code)
    );
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesLanguage =
        languageFilter === "all" ||
        resolveLanguageCode(lead.qualification_data?.visitor_language) === languageFilter;
      const matchesSearch = query === "" || (lead.name ?? "").toLowerCase().includes(query);
      return matchesStatus && matchesLanguage && matchesSearch;
    });
  }, [leads, search, statusFilter, languageFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {STATUS_OPTIONS.map((status) => (
              <TabsTrigger key={status} value={status}>
                {STATUS_META[status].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* The same picker as settings, so a rep can filter to ANY
            language rather than only the ones that already have leads -
            which is what the old chips allowed, and why English could not
            be selected at all. Languages with leads sit on top with their
            counts so the useful ones are not buried among a hundred
            empty ones. */}
        <div className="flex w-full items-center gap-2 sm:w-64">
          <div className="min-w-0 flex-1">
            <LanguagePicker
              value={languageFilter === "all" ? "" : languageFilter}
              onChange={(code) => setLanguageFilter(code || "all")}
              placeholder="All languages"
              priority={withLeads}
            />
          </div>
          {languageFilter !== "all" && (
            <button
              type="button"
              onClick={() => setLanguageFilter("all")}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-8"
          />
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {leads.length === 0 ? "No leads yet." : "No leads match your search or filter."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
