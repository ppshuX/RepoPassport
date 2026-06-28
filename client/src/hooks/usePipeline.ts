export interface PipelineEvent {
  type: "step:start" | "step:complete" | "step:error" | "progress" | "result" | "log" | "error";
  step?: string;
  message?: string;
  data?: unknown;
}

export interface StepState {
  clone: "pending" | "running" | "completed" | "failed";
  extract: "pending" | "running" | "completed" | "failed";
  generate: "pending" | "running" | "completed" | "failed";
  review: "pending" | "running" | "completed" | "failed";
  submit: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface EvidenceItem {
  section: string;
  hasEvidence: boolean;
  confidence: number;
}

export interface PipelineState {
  runId: string | null;
  status: "idle" | "analyzing" | "review" | "submitting" | "completed" | "failed";
  steps: StepState;
  result: PipelineResult | null;
  logs: string[];
  error: string | null;
}

export interface PipelineResult {
  repo: { owner: string; name: string; url: string; defaultBranch: string; commitSha: string };
  platform: string;
  detectedLanguages: string[];
  filteredReadme: string;
  chineseReadme?: string;
  evidenceMap: EvidenceItem[];
  facts: { items: { category: string; content: string; combinedConfidence: number }[]; overallConfidence: number };
  prUrl?: string;
}

const initialSteps: StepState = {
  clone: "pending",
  extract: "pending",
  generate: "pending",
  review: "pending",
  submit: "skipped",
};

export function initialPipelineState(): PipelineState {
  return {
    runId: null,
    status: "idle",
    steps: { ...initialSteps },
    result: null,
    logs: [],
    error: null,
  };
}

const STEP_ORDER = ["clone", "extract", "generate", "review", "submit"] as const;

export function pipelineReducer(state: PipelineState, action: PipelineEvent): PipelineState {
  switch (action.type) {
    case "step:start": {
      const step = (action.step || "") as keyof StepState;
      if (step in state.steps) {
        return { ...state, steps: { ...state.steps, [step]: "running" } };
      }
      return state;
    }

    case "step:complete": {
      const step = (action.step || "") as keyof StepState;
      if (step in state.steps) {
        const newSteps = { ...state.steps, [step]: "completed" };
        const nextIdx = STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]) + 1;
        if (nextIdx < STEP_ORDER.length && newSteps[STEP_ORDER[nextIdx]] === "pending") {
          newSteps[STEP_ORDER[nextIdx]] = "running";
        }
        return {
          ...state,
          steps: newSteps,
          status: step === "submit" ? "completed" : step === "review" ? "review" : "analyzing",
        };
      }
      return state;
    }

    case "step:error":
    case "error": {
      const step = (action.step || "") as keyof StepState;
      const newSteps = state.steps;
      if (step in newSteps) {
        newSteps[step] = "failed";
      }
      return {
        ...state,
        status: "failed",
        steps: { ...newSteps },
        error: action.message || null,
      };
    }

    case "result": {
      const result = (action.data && typeof action.data === "object" ? action.data : null) as PipelineResult | null;
      if (result?.prUrl) {
        return { ...state, result, status: "completed" };
      }
      return { ...state, result, status: result ? "review" : state.status };
    }

    case "log": {
      const msg = action.message || "";
      return { ...state, logs: [...state.logs.slice(-199), msg] };
    }

    default:
      return state;
  }
}
