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

    // Handle Arrays: replace entirely if they differ.
    // TODO: Phase 2+ — implement array splice operations for large arrays.
    if (Array.isArray(oldState) || Array.isArray(newState)) {
        if (!Array.isArray(oldState) || !Array.isArray(newState) || oldState.length !== newState.length) {
            return newState;
        }
        for (let i = 0; i < oldState.length; i++) {
            if (diff(oldState[i], newState[i]) !== undefined) {
                return newState;
            }
        }
        return undefined;
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
