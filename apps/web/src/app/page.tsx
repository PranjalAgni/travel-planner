import { Planner } from "@/components/Planner";

export default function Home() {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 lg:px-5">
        <span aria-hidden className="text-lg">
          ✈️
        </span>
        <h1 className="text-base font-semibold tracking-tight text-slate-900">Trip Planner</h1>
        <span className="ml-1 hidden text-sm text-slate-500 sm:inline">Fit every spot into your dates, the quick way.</span>
      </header>
      <Planner />
    </>
  );
}
