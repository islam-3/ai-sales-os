"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadCard } from "./LeadCard";
import { LeadProfile, LeadStatus, STATUS_META, STATUS_OPTIONS } from "@/lib/dashboard";

type StatusFilter = "all" | LeadStatus;

export function LeadsSection({ leads }: { leads: LeadProfile[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Lets a rep pull their own leads instead of waiting to be handed them.
  const [languageFilter, setLanguageFilter] = useState<string>("all");

  // Only the languages that actually appear, so the control stays out of
  // the way for a business serving one.
  const languages = useMemo(() => {
    const seen = new Set<string>();
    for (const lead of leads) {
      const language = lead.qualification_data?.visitor_language?.trim();
      if (language) seen.add(language);
    }
    return Array.from(seen).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesLanguage =
        languageFilter === "all" ||
        lead.qualification_data?.visitor_language?.trim() === languageFilter;
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

        {/* Only worth showing once leads actually arrive in more than one
            language; a single-language business never sees it. */}
        {languages.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLanguageFilter("all")}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                languageFilter === "all" ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              All languages
            </button>
            {languages.map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setLanguageFilter(language)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  languageFilter === language ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                {language}
              </button>
            ))}
          </div>
        )}

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
