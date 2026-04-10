export type PPDiffAlgorithm = "shallow" | "deep" | ((prev: any, next: any) => any);

/** Simple recursive diff — returns only changed keys. */
export function deepDiff(prev: any, next: any): any {
    if (prev === next) return undefined;
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) {
        return next;
    }
    if (Array.isArray(prev) || Array.isArray(next)) {
        const a = prev as unknown[];
        const b = next as unknown[];
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) return next;
        return undefined;
    }
    const result: Record<string, unknown> = {};
    let hasChanges = false;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
        if (!(key in next)) {
            result[key] = null; // deleted
            hasChanges = true;
        } else {
            const d = deepDiff(prev[key], next[key]);
            if (d !== undefined) {
                result[key] = d;
                hasChanges = true;
            }
        }
    }
    return hasChanges ? result : undefined;
}

/** Shallow diff — only compares top-level keys. */
export function shallowDiff(prev: any, next: any): any {
    if (prev === next) return undefined;
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) return next;
    const result: Record<string, unknown> = {};
    let hasChanges = false;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
        if (prev[key] !== next[key]) {
            result[key] = next[key] ?? null;
            hasChanges = true;
        }
    }
    return hasChanges ? result : undefined;
}

export function computeDiff(prev: any, next: any, algorithm: PPDiffAlgorithm = "deep"): any {
    if (typeof algorithm === "function") {
        return algorithm(prev, next);
    }
    if (algorithm === "shallow") {
        return shallowDiff(prev, next);
    }
    return deepDiff(prev, next);
}
