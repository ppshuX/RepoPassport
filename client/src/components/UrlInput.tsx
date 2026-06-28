import { useState } from "react";

interface UrlInputProps {
  onAnalyze: (repoUrl: string) => void;
  disabled: boolean;
}

export function UrlInput({ onAnalyze, disabled }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setValidating(true);
    setError(null);

    try {
      const res = await fetch("/api/validate-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: trimmed }),
      });
      const data = await res.json() as { valid: boolean; error?: string; platform?: string };

      if (data.valid) {
        onAnalyze(trimmed);
      } else {
        setError(data.error || "Invalid repository URL");
      }
    } catch {
      setError("Failed to validate URL. Is the backend running?");
    } finally {
      setValidating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={disabled}
          className="flex-1 px-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg 
                     text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]
                     disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
        />
        <button
          type="submit"
          disabled={disabled || validating || !url.trim()}
          className="px-6 py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] 
                     disabled:text-[#484f58] text-white rounded-lg font-medium text-sm
                     transition-colors disabled:cursor-not-allowed whitespace-nowrap"
        >
          {validating ? "Validating..." : disabled ? "Analyzing..." : "Start Analysis"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[#f85149] text-sm">{error}</p>
      )}
    </form>
  );
}
