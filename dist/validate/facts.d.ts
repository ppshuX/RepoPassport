import { z } from "zod";
export declare const EvidenceSchema: z.ZodObject<{
    sourceType: z.ZodEnum<["file", "config", "dependency", "export"]>;
    filePath: z.ZodString;
    commitSha: z.ZodString;
    symbol: z.ZodOptional<z.ZodString>;
    lineRange: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    confidence: z.ZodNumber;
    extractionMethod: z.ZodEnum<["static", "ai-inferred"]>;
}, "strip", z.ZodTypeAny, {
    sourceType: "file" | "config" | "dependency" | "export";
    filePath: string;
    commitSha: string;
    confidence: number;
    extractionMethod: "static" | "ai-inferred";
    symbol?: string | undefined;
    lineRange?: [number, number] | undefined;
}, {
    sourceType: "file" | "config" | "dependency" | "export";
    filePath: string;
    commitSha: string;
    confidence: number;
    extractionMethod: "static" | "ai-inferred";
    symbol?: string | undefined;
    lineRange?: [number, number] | undefined;
}>;
export declare const FactsItemSchema: z.ZodObject<{
    category: z.ZodEnum<["project_name", "description", "purpose", "tech_stack", "installation", "usage", "configuration", "api_surface", "architecture", "dependencies"]>;
    content: z.ZodString;
    evidence: z.ZodArray<z.ZodObject<{
        sourceType: z.ZodEnum<["file", "config", "dependency", "export"]>;
        filePath: z.ZodString;
        commitSha: z.ZodString;
        symbol: z.ZodOptional<z.ZodString>;
        lineRange: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        confidence: z.ZodNumber;
        extractionMethod: z.ZodEnum<["static", "ai-inferred"]>;
    }, "strip", z.ZodTypeAny, {
        sourceType: "file" | "config" | "dependency" | "export";
        filePath: string;
        commitSha: string;
        confidence: number;
        extractionMethod: "static" | "ai-inferred";
        symbol?: string | undefined;
        lineRange?: [number, number] | undefined;
    }, {
        sourceType: "file" | "config" | "dependency" | "export";
        filePath: string;
        commitSha: string;
        confidence: number;
        extractionMethod: "static" | "ai-inferred";
        symbol?: string | undefined;
        lineRange?: [number, number] | undefined;
    }>, "many">;
    combinedConfidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    content: string;
    category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
    evidence: {
        sourceType: "file" | "config" | "dependency" | "export";
        filePath: string;
        commitSha: string;
        confidence: number;
        extractionMethod: "static" | "ai-inferred";
        symbol?: string | undefined;
        lineRange?: [number, number] | undefined;
    }[];
    combinedConfidence: number;
}, {
    content: string;
    category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
    evidence: {
        sourceType: "file" | "config" | "dependency" | "export";
        filePath: string;
        commitSha: string;
        confidence: number;
        extractionMethod: "static" | "ai-inferred";
        symbol?: string | undefined;
        lineRange?: [number, number] | undefined;
    }[];
    combinedConfidence: number;
}>;
export declare const RepoMetaSchema: z.ZodObject<{
    owner: z.ZodString;
    name: z.ZodString;
    url: z.ZodString;
    defaultBranch: z.ZodString;
    commitSha: z.ZodString;
}, "strip", z.ZodTypeAny, {
    owner: string;
    name: string;
    commitSha: string;
    url: string;
    defaultBranch: string;
}, {
    owner: string;
    name: string;
    commitSha: string;
    url: string;
    defaultBranch: string;
}>;
export declare const RepoFactsSchema: z.ZodObject<{
    repo: z.ZodObject<{
        owner: z.ZodString;
        name: z.ZodString;
        url: z.ZodString;
        defaultBranch: z.ZodString;
        commitSha: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        owner: string;
        name: string;
        commitSha: string;
        url: string;
        defaultBranch: string;
    }, {
        owner: string;
        name: string;
        commitSha: string;
        url: string;
        defaultBranch: string;
    }>;
    analyzedAt: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        category: z.ZodEnum<["project_name", "description", "purpose", "tech_stack", "installation", "usage", "configuration", "api_surface", "architecture", "dependencies"]>;
        content: z.ZodString;
        evidence: z.ZodArray<z.ZodObject<{
            sourceType: z.ZodEnum<["file", "config", "dependency", "export"]>;
            filePath: z.ZodString;
            commitSha: z.ZodString;
            symbol: z.ZodOptional<z.ZodString>;
            lineRange: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            confidence: z.ZodNumber;
            extractionMethod: z.ZodEnum<["static", "ai-inferred"]>;
        }, "strip", z.ZodTypeAny, {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }, {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }>, "many">;
        combinedConfidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: string;
        category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
        evidence: {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }[];
        combinedConfidence: number;
    }, {
        content: string;
        category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
        evidence: {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }[];
        combinedConfidence: number;
    }>, "many">;
    overallConfidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    repo: {
        owner: string;
        name: string;
        commitSha: string;
        url: string;
        defaultBranch: string;
    };
    analyzedAt: string;
    items: {
        content: string;
        category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
        evidence: {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }[];
        combinedConfidence: number;
    }[];
    overallConfidence: number;
}, {
    repo: {
        owner: string;
        name: string;
        commitSha: string;
        url: string;
        defaultBranch: string;
    };
    analyzedAt: string;
    items: {
        content: string;
        category: "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies";
        evidence: {
            sourceType: "file" | "config" | "dependency" | "export";
            filePath: string;
            commitSha: string;
            confidence: number;
            extractionMethod: "static" | "ai-inferred";
            symbol?: string | undefined;
            lineRange?: [number, number] | undefined;
        }[];
        combinedConfidence: number;
    }[];
    overallConfidence: number;
}>;
export type RepoFactsValidated = z.infer<typeof RepoFactsSchema>;
/**
 * 校验 AI 输出的 RepoFacts JSON。
 * 返回 { valid: true, data } 或 { valid: false, errors, validItems }。
 */
export declare function validateRepoFacts(raw: unknown): {
    valid: boolean;
    data?: RepoFactsValidated;
    errors?: z.ZodError;
    validItems?: number;
    totalItems?: number;
};
/**
 * 从部分校验结果构建合法的 RepoFacts。
 * 仅保留通过校验的 items，若低于最小阈值返回 null。
 */
export declare function buildPartialRepoFacts(repoMeta: z.infer<typeof RepoMetaSchema>, validItems: z.infer<typeof FactsItemSchema>[], minItems?: number): z.infer<typeof RepoFactsSchema> | null;
//# sourceMappingURL=facts.d.ts.map