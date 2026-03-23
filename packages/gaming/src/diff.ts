/**
 * Sentinel object for marking deleted keys in diffs.
 * Using a unique object prevents collision with real payload data.
 */
export const PP_DELETED = Object.freeze({ __pp_deleted: true } as const);
export type PPDeletedMarker = typeof PP_DELETED;

/**
 * Type guard to check if a value is the PP deletion sentinel.
 */
export function isDeleted(value: unknown): value is PPDeletedMarker {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).__pp_deleted === true
    );
}

// ---- Array delta operations ----

export type ArrayOp =
    | { op: "set"; index: number; value: unknown }
    | { op: "splice"; index: number; deleteCount: number; items: unknown[] };

export interface PPArrayOpsMarker {
    __pp_array_ops: ArrayOp[];
}

export function isArrayOps(value: unknown): value is PPArrayOpsMarker {
    return (
        typeof value === "object" &&
        value !== null &&
        Array.isArray((value as Record<string, unknown>).__pp_array_ops)
    );
}

/** Max array length to apply Myers diff. Larger arrays fall back to wholesale replacement. */
const ARRAY_DIFF_MAX_SIZE = 1000;

/**
 * Myers O(ND) diff algorithm for arrays.
 * Returns ops in descending index order (safe for in-place application without offset tracking).
 * Returns undefined if arrays are identical.
 */
function myersDiff(a: unknown[], b: unknown[]): ArrayOp[] | undefined {
    const n = a.length;
    const m = b.length;

    // Identity shortcut
    if (n === 0 && m === 0) return undefined;
    if (n === 0) return [{ op: "splice", index: 0, deleteCount: 0, items: b.slice() }];
    if (m === 0) return [{ op: "splice", index: 0, deleteCount: n, items: [] }];

    // Element equality check — fast path for primitives, then deep for objects
    function eq(x: unknown, y: unknown): boolean {
        if (x === y) return true;
        // For objects/arrays, use diff to check equality
        if (typeof x === "object" && x !== null && typeof y === "object" && y !== null) {
            return diff(x, y) === undefined;
        }
        return false;
    }

    // Myers edit script — produces list of (x, y, isInsert, isDelete) edit steps
    const max = n + m;
    const v = new Int32Array(2 * max + 1);
    const trace: Int32Array[] = [];

    let found = false;
    outer: for (let d = 0; d <= max; d++) {
        trace.push(v.slice());
        for (let k = -d; k <= d; k += 2) {
            let x: number;
            const ki = k + max;
            if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
                x = v[ki + 1]; // move down
            } else {
                x = v[ki - 1] + 1; // move right
            }
            let y = x - k;
            while (x < n && y < m && eq(a[x], b[y])) { x++; y++; }
            v[ki] = x;
            if (x >= n && y >= m) { found = true; break outer; }
        }
    }
    if (!found) return b.slice() as any; // fallback

    // Backtrack to build edit script
    let x = n, y = m;
    const edits: Array<{ type: "insert" | "delete" | "equal"; ax: number; by: number }> = [];

    for (let d = trace.length - 1; d > 0 && (x > 0 || y > 0); d--) {
        const vPrev = trace[d - 1];
        const k = x - y;
        const ki = k + max;
        const kPrev = (k === -d || (k !== d && vPrev[ki - 1] < vPrev[ki + 1])) ? k + 1 : k - 1;
        const xPrev = vPrev[kPrev + max];
        const yPrev = xPrev - kPrev;

        while (x > xPrev + 1 && y > yPrev + 1) { x--; y--; edits.push({ type: "equal", ax: x, by: y }); }
        if (d > 0) {
            if (x === xPrev + 1 && y === yPrev) {
                edits.push({ type: "delete", ax: x - 1, by: y });
                x--;
            } else if (y === yPrev + 1 && x === xPrev) {
                edits.push({ type: "insert", ax: x, by: y - 1 });
                y--;
            } else {
                // diagonal
                while (x > xPrev && y > yPrev) { x--; y--; edits.push({ type: "equal", ax: x, by: y }); }
            }
        }
    }

    edits.reverse();

    // Merge consecutive edits into splice ops
    const ops: ArrayOp[] = [];
    let i = 0;
    while (i < edits.length) {
        const e = edits[i];
        if (e.type === "equal") { i++; continue; }

        // Collect contiguous delete/insert block
        const startIdx = e.ax;
        let deleteCount = 0;
        const items: unknown[] = [];
        while (i < edits.length && edits[i].type !== "equal") {
            if (edits[i].type === "delete") deleteCount++;
            else items.push(b[edits[i].by]);
            i++;
        }
        ops.push({ op: "splice", index: startIdx, deleteCount, items });
    }

    if (ops.length === 0) return undefined;

    // Return ops in descending index order for safe in-place application
    ops.sort((a, b) => (b.op === "splice" ? (b as any).index : 0) - (a.op === "splice" ? (a as any).index : 0));

    return ops;
}

/**
 * Check if a value is a "plain" diffable object (not Date, RegExp, null, etc.)
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
    if (typeof val !== "object" || val === null) return false;
    // Date, RegExp, ArrayBuffer, TypedArray, Map, Set — treat as primitives
    if (val instanceof Date || val instanceof RegExp) return false;
    if (ArrayBuffer.isView(val) || val instanceof ArrayBuffer) return false;
    return !Array.isArray(val);
}

/**
 * Compares two state objects and returns an object containing only the differences.
 * This is a deep recursive comparison optimized for 60 FPS.
 * If a value is deleted, it returns the PP_DELETED sentinel for that key.
 * 
 * Performance: Uses for...in loops instead of Set/Array spread to avoid
 * GC pressure on hot paths (60 frames/second).
 * 
 * @param oldState The previous state
 * @param newState The current state
 * @returns The delta patch, or undefined if no changes
 */
export function diff(oldState: any, newState: any): any {
    // Identity check (covers same ref, same primitive, both undefined, both null)
    if (oldState === newState) {
        return undefined;
    }

    // If either is not a plain object, return the new value directly.
    // This handles: primitives, null, undefined, Date, RegExp, etc.
    if (!isPlainObject(oldState) || !isPlainObject(newState)) {
        // Special case: Date comparison by value
        if (oldState instanceof Date && newState instanceof Date) {
            return oldState.getTime() === newState.getTime() ? undefined : newState;
        }
        return newState;
    }

    // Handle Arrays: compute delta ops for efficient patching.
    if (Array.isArray(oldState) || Array.isArray(newState)) {
        if (!Array.isArray(oldState) || !Array.isArray(newState)) {
            return newState; // type changed — full replacement
        }
        // Large arrays: wholesale replacement is cheaper than diffing
        if (oldState.length > ARRAY_DIFF_MAX_SIZE || newState.length > ARRAY_DIFF_MAX_SIZE) {
            if (oldState.length !== newState.length) return newState;
            for (let i = 0; i < oldState.length; i++) {
                if (diff(oldState[i], newState[i]) !== undefined) return newState;
            }
            return undefined;
        }
        const ops = myersDiff(oldState, newState);
        if (ops === undefined) return undefined;
        // Wholesale if more than half the array changed (cheaper to send full array)
        if (ops.length > Math.ceil(oldState.length / 2) + 1) return newState;
        return { __pp_array_ops: ops } as PPArrayOpsMarker;
    }

    const delta: any = {};
    let hasChanges = false;

    // Pass 1: Check keys in newState (added + changed)
    for (const key in newState) {
        if (!Object.prototype.hasOwnProperty.call(newState, key)) continue;

        if (!Object.prototype.hasOwnProperty.call(oldState, key)) {
            // Key was added
            delta[key] = newState[key];
            hasChanges = true;
        } else {
            // Key exists in both — deep diff
            const nestedDiff = diff(oldState[key], newState[key]);
            if (nestedDiff !== undefined) {
                delta[key] = nestedDiff;
                hasChanges = true;
            }
        }
    }

    // Pass 2: Check keys deleted from oldState
    for (const key in oldState) {
        if (!Object.prototype.hasOwnProperty.call(oldState, key)) continue;
        if (!Object.prototype.hasOwnProperty.call(newState, key)) {
            delta[key] = PP_DELETED;
            hasChanges = true;
        }
    }

    return hasChanges ? delta : undefined;
}
