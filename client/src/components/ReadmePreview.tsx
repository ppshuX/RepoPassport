import { useState } from "react";

interface ReadmePreviewProps {
  chineseReadme?: string;
  filteredReadme: string;
  detectedLanguages: string[];
}

export function ReadmePreview({ chineseReadme, filteredReadme, detectedLanguages }: ReadmePreviewProps) {
  const [tab, setTab] = useState<"en" | "zh">("en");

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden flex flex-col">
      <div className="flex items-center border-b border-[#30363d] px-4">
        <div className="flex text-sm">
          <button
            onClick={() => setTab("en")}
            className={`px-4 py-2 border-b-2 transition-colors ${
              tab === "en"
                ? "border-[#58a6ff] text-[#c9d1d9]"
                : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            README.en.md
          </button>
          {chineseReadme && (
            <button
              onClick={() => setTab("zh")}
              className={`px-4 py-2 border-b-2 transition-colors ${
                tab === "zh"
                  ? "border-[#58a6ff] text-[#c9d1d9]"
                  : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
              }`}
            >
              README.md (zh)
            </button>
          )}
        </div>
        <div className="ml-auto text-xs text-[#8b949e]">
          {detectedLanguages.join(", ")}
        </div>
      </div>

      <div className="overflow-auto p-4 max-h-[60vh]">
        <pre className="text-sm text-[#c9d1d9] whitespace-pre-wrap font-mono leading-relaxed">
          {tab === "en" ? filteredReadme : (chineseReadme || "")}
        </pre>
      </div>
    </div>
  );
}
