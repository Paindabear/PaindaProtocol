/**
 * Compares two state objects and returns an object containing only the differences.
 * This is a deep recursive comparison.
 * If a value is deleted, it returns `undefined` for that key, which allows the patch
 * algorithm to know it should remove that key.
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

    // Handle Arrays differently: for now, we just replace them entirely if they differ.
    // Advanced delta engines can do array operational diffs, but simple replacement is safer for MVPs.
    if (Array.isArray(oldState) || Array.isArray(newState)) {
        // Basic array diff: if length or contents differ, send the whole array.
        // In a real high-perf engine, we'd emit array splice commands, but for now simple replacement.
        if (!Array.isArray(oldState) || !Array.isArray(newState) || oldState.length !== newState.length) {
            return newState;
        }
        let changed = false;
        for (let i = 0; i < oldState.length; i++) {
            // Replace JSON.stringify bottleneck with a fast, recursive check.
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
            // Key was deleted
            delta[key] = "__DELETED__"; // Use a sentinel value for deletion since undefined keys might be omitted by JSON.stringify
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
