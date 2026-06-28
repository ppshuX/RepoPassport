import type { StepState } from "../hooks/usePipeline";

interface ProgressStepsProps {
  steps: StepState;
}

const STEP_LABELS: { key: keyof StepState; label: string }[] = [
  { key: "clone", label: "Clone Repo" },
  { key: "extract", label: "Extract Facts" },
  { key: "generate", label: "Generate README" },
  { key: "review", label: "Review & Evidence" },
  { key: "submit", label: "Submit PR" },
];

function statusIcon(status: string): string {
  switch (status) {
    case "completed": return "\u2713"; // checkmark
    case "running": return "\u25CF";   // filled circle
    case "failed": return "\u2717";    // X mark
    case "skipped": return "\u2014";   // em dash
    default: return "\u25CB";          // empty circle
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "text-[#3fb950]";
    case "running": return "text-[#58a6ff] animate-pulse";
    case "failed": return "text-[#f85149]";
    case "skipped": return "text-[#484f58]";
    default: return "text-[#30363d]";
  }
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  return (
    <div className="flex items-center gap-2 mb-6 text-sm overflow-x-auto pb-2">
      {STEP_LABELS.map((step, i) => {
        const s = steps[step.key];
        return (
          <span key={step.key} className="flex items-center gap-1 whitespace-nowrap">
            <span className={statusColor(s)}>{statusIcon(s)}</span>
            <span className={statusColor(s)}>{step.label}</span>
            {i < STEP_LABELS.length - 1 && (
              <span className="text-[#30363d] mx-1">\u2500\u2500</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
