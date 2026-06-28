import { useReducer, useCallback, useState } from "react";
import { UrlInput } from "./components/UrlInput";
import { ProgressSteps } from "./components/ProgressSteps";
import { ReadmePreview } from "./components/ReadmePreview";
import { EvidencePanel } from "./components/EvidencePanel";
import { SubmitPanel } from "./components/SubmitPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import {
  pipelineReducer,
  initialPipelineState,
  type PipelineEvent,
  type PipelineResult,
} from "./hooks/usePipeline";

export default function App() {
  const [state, dispatch] = useReducer(pipelineReducer, initialPipelineState());
  const [draftSaved, setDraftSaved] = useState(false);
  const [logsVisible, setLogsVisible] = useState(false);

  const onMessage = useCallback((event: PipelineEvent) => {
    dispatch(event);
  }, []);

  const { runId } = state;

  useWebSocket({
    runId,
    onMessage,
    onError: (err) =>
      dispatch({ type: "error", message: err }),
  });

  async function handleAnalyze(repoUrl: string) {
    dispatch({ type: "step:start", step: "clone", message: "Starting..." });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, provider: "mock" }),
      });
      const data = await res.json() as { runId: string };
      if (data.runId) {
        dispatch({ type: "result", data: { runId: data.runId } });
      }
    } catch (err) {
      dispatch({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to start analysis",
      });
    }
  }

  function handleSaveDraft() {
    setDraftSaved(true);
  }

  function handleSubmitPR() {
    // WebSocket will update state
  }

  const result = state.result as PipelineResult | null;
  const hasResult = result && (result.filteredReadme || result.chineseReadme);

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">
          RepoPassport
        </h1>
        <p className="text-[#8b949e] text-sm">
          AI-Assisted README Generator
          {state.runId && <span className="ml-4 text-[#484f58]">Run: {state.runId.slice(0, 8)}</span>}
        </p>
      </header>

      <UrlInput onAnalyze={handleAnalyze} disabled={state.status === "analyzing" || state.status === "submitting"} />

      {state.status !== "idle" && (
        <ProgressSteps steps={state.steps} />
      )}

      {state.error && (
        <div className="mb-6 p-4 bg-[#161b22] border border-[#f85149] rounded-lg">
          <p className="text-[#f85149] text-sm">{state.error}</p>
        </div>
      )}

      {hasResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ReadmePreview
            chineseReadme={result!.chineseReadme}
            filteredReadme={result!.filteredReadme}
            detectedLanguages={result!.detectedLanguages}
          />
          <EvidencePanel
            evidenceMap={result!.evidenceMap || []}
            overallConfidence={result!.facts?.overallConfidence || 0}
          />
        </div>
      )}

      {state.status === "review" || state.status === "completed" && state.steps.submit !== "running" ? (
        <SubmitPanel
          runId={state.runId || ""}
          result={result}
          steps={state.steps}
          onSaveDraft={handleSaveDraft}
          onSubmitPR={handleSubmitPR}
        />
      ) : null}

      {draftSaved && (
        <div className="mt-4 p-3 bg-[#161b22] border border-[#3fb950] rounded-lg">
          <p className="text-[#3fb950] text-sm">Draft saved to ~/.repopassport/drafts/</p>
        </div>
      )}

      {state.logs.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setLogsVisible(!logsVisible)}
            className="text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
          >
            {logsVisible ? "Hide Logs" : "Show Logs"} ({state.logs.length})
          </button>
          {logsVisible && (
            <div className="mt-2 bg-[#0d1117] border border-[#30363d] rounded-lg p-3 max-h-48 overflow-auto">
              {state.logs.map((log, i) => (
                <div key={i} className="text-xs text-[#8b949e] font-mono leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
