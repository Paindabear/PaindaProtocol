import { isDeleted } from "./diff.js";

/**
 * Applies a delta patch to an existing state object.
 * Mutates the state object in-place for performance.
 * 
 * Handles:
 * - Nested objects (deep merge)
 * - PP_DELETED sentinels (key removal)
 * - Date objects (assigned as-is, not merged)
 * - Arrays (replaced entirely, not merged)
 * - null values (assigned as-is)
 * 
 * @param state The current state to be modified
 * @param delta The delta patch containing changes
 * @returns The patched state
 */
export function patch(state: any, delta: any): any {
    if (delta === undefined) {
        return state;
    }

    // Non-object delta replaces state entirely (primitives, arrays, null, Date)
    if (typeof delta !== "object" || delta === null || Array.isArray(delta) || delta instanceof Date) {
        return delta;
    }

    // If state is not a patchable object, start fresh
    if (typeof state !== "object" || state === null || Array.isArray(state) || state instanceof Date) {
        state = {};
    }

    for (const key in delta) {
        if (!Object.prototype.hasOwnProperty.call(delta, key)) continue;

        const val = delta[key];

        if (isDeleted(val)) {
            // Delete key
            delete state[key];
        } else if (val instanceof Date) {
            // Date — assign directly, don't recurse
            state[key] = val;
        } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
            // Nested object — deep merge
            if (!state[key] || typeof state[key] !== "object" || Array.isArray(state[key]) || state[key] instanceof Date) {
                state[key] = {};
            }
            state[key] = patch(state[key], val);
        } else {
            // Primitive, array, or null — assign directly
            state[key] = val;
        }
    }

    return state;
}
