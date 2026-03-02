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
 * Compares two state objects and returns an object containing only the differences.
 * This is a deep recursive comparison.
 * If a value is deleted, it returns the PP_DELETED sentinel for that key.
 * 
 * @param oldState The previous state
 * @param newState The current state
 * @returns The delta patch, or undefined if no changes
 */
export function diff(oldState: any, newState: any): any {
    if (oldState === newState) {
        return undefined;
    }

    if (typeof oldState !== "object" || oldState === null ||
        typeof newState !== "object" || newState === null) {
        return newState;
    }

    // Handle Arrays: replace entirely if they differ.
    // TODO: Phase 2+ — implement array splice operations for large arrays.
    if (Array.isArray(oldState) || Array.isArray(newState)) {
        if (!Array.isArray(oldState) || !Array.isArray(newState) || oldState.length !== newState.length) {
            return newState;
        }
        let changed = false;
        for (let i = 0; i < oldState.length; i++) {
            if (diff(oldState[i], newState[i]) !== undefined) {
                changed = true;
                break;
            }
        }
        return changed ? newState : undefined;
    }

    const delta: any = {};
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

    for (const key of allKeys) {
        if (!(key in newState)) {
            // Key was deleted — use sentinel object to avoid string collision
            delta[key] = PP_DELETED;
            hasChanges = true;
        } else if (!(key in oldState)) {
            // Key was added
            delta[key] = newState[key];
            hasChanges = true;
        } else {
            // Key exists in both, check deep difference
            const nestedDiff = diff(oldState[key], newState[key]);
            if (nestedDiff !== undefined) {
                delta[key] = nestedDiff;
                hasChanges = true;
            }
        }
    }

    return hasChanges ? delta : undefined;
}
