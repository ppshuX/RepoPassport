import type { EvidenceItem } from "../hooks/usePipeline";

interface EvidencePanelProps {
  evidenceMap: EvidenceItem[];
  overallConfidence: number;
}

function confidenceColor(value: number): string {
  if (value >= 0.8) return "text-[#3fb950]";
  if (value >= 0.5) return "text-[#d2991d]";
  return "text-[#f85149]";
}

function barColor(value: number): string {
  if (value >= 0.8) return "bg-[#3fb950]";
  if (value >= 0.5) return "bg-[#d2991d]";
  return "bg-[#f85149]";
}

export function EvidencePanel({ evidenceMap, overallConfidence }: EvidencePanelProps) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
        <span className="text-sm font-medium text-[#c9d1d9]">Evidence Report</span>
        <span className={`text-sm ${confidenceColor(overallConfidence)}`}>
          Overall: {(overallConfidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="overflow-auto p-4 max-h-[60vh]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#8b949e] text-left border-b border-[#21262d]">
              <th className="pb-2 font-normal">Section</th>
              <th className="pb-2 font-normal text-center">Evidence</th>
              <th className="pb-2 font-normal text-right">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {evidenceMap.map((item) => (
              <tr key={item.section} className="border-b border-[#21262d] last:border-0">
                <td className="py-2 text-[#c9d1d9]">{item.section}</td>
                <td className="py-2 text-center">
                  {item.hasEvidence ? (
                    <span className="text-[#3fb950]">\u2713</span>
                  ) : (
                    <span className="text-[#f85149]">\u2717</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-[#21262d] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(item.confidence)}`}
                        style={{ width: `${item.confidence * 100}%` }}
                      />
                    </div>
                    <span className={`w-10 text-right ${confidenceColor(item.confidence)}`}>
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
