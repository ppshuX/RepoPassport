import { useState } from "react";
import type { PipelineResult, StepState } from "../hooks/usePipeline";

interface SubmitPanelProps {
  runId: string;
  result: PipelineResult | null;
  steps: StepState;
  onSaveDraft: () => void;
  onSubmitPR: () => void;
}

export function SubmitPanel({ runId, result, steps, onSaveDraft, onSubmitPR }: SubmitPanelProps) {
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reviewDone = steps.review === "completed";
  const submitStatus = steps.submit;
  const repoName = result?.repo
    ? `${result.repo.owner}/${result.repo.name}`
    : "";

  async function handleSubmitPR() {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    if (confirmText !== `SUBMIT ${repoName}`) return;

    setSubmitting(true);
    try {
      await fetch(`/api/runs/${runId}/submit`, { method: "POST" });
      onSubmitPR();
    } catch {
      // error handled by websocket
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  function handleSaveDraft() {
    onSaveDraft();
  }

  function cancelConfirm() {
    setShowConfirm(false);
    setConfirmText("");
  }

  if (!reviewDone) return null;

  if (submitStatus === "completed") {
    return (
      <div className="flex items-center gap-4 mt-6 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
        <span className="text-[#3fb950]">\u2713 PR Submitted</span>
        {result?.prUrl && (
          <a href={result.prUrl} target="_blank" rel="noopener noreferrer"
             className="text-[#58a6ff] hover:underline text-sm">
            View PR &rarr;
          </a>
        )}
      </div>
    );
  }

  if (submitStatus === "running") {
    return (
      <div className="flex items-center gap-4 mt-6 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
        <span className="text-[#58a6ff] animate-pulse">\u25CF Submitting PR...</span>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {showConfirm && (
        <div className="mb-4 p-4 bg-[#161b22] border border-[#d2991d] rounded-lg">
          <p className="text-sm text-[#d2991d] mb-3">
            This will fork the repository, create a branch, and submit a Draft PR.
            Remote resources will be created.
          </p>
          <p className="text-xs text-[#8b949e] mb-2">
            Type <code className="text-[#c9d1d9]">SUBMIT {repoName}</code> to confirm:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`SUBMIT ${repoName}`}
              className="flex-1 px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded
                         text-[#c9d1d9] text-sm font-mono focus:outline-none focus:border-[#58a6ff]"
            />
            <button onClick={cancelConfirm}
              className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] rounded text-sm text-[#c9d1d9]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSaveDraft}
          className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg text-sm transition-colors">
          Save Draft
        </button>
        <button onClick={handleSubmitPR}
          disabled={submitting}
          className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] 
                     disabled:text-[#484f58] text-white rounded-lg text-sm transition-colors">
          {submitting ? "Submitting..." : showConfirm ? "Confirm Submit PR" : "Submit Draft PR"}
        </button>
      </div>
    </div>
  );
}
