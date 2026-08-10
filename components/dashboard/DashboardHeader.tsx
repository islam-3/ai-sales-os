export function DashboardHeader({ clinicName }: { clinicName: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          {clinicName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold text-slate-900">{clinicName}</span>
      </div>
    </header>
  );
}
