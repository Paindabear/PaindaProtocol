import { isDeleted } from "./diff.js";

/**
 * Applies a delta patch to an existing state object.
 * Mutates the state object in-place for performance.
 * 
 * @param state The current state to be modified
 * @param delta The delta patch containing changes
 */
export function patch(state: any, delta: any): any {
    if (delta === undefined) {
        return state;
    }

    if (typeof delta !== "object" || delta === null || Array.isArray(delta)) {
        return delta;
    }

    if (typeof state !== "object" || state === null || Array.isArray(state)) {
        state = {};
    }

    for (const key in delta) {
        if (Object.prototype.hasOwnProperty.call(delta, key)) {
            const val = delta[key];
            if (isDeleted(val)) {
                delete state[key];
            } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
                if (!state[key] || typeof state[key] !== "object" || Array.isArray(state[key])) {
                    state[key] = {};
                }
                state[key] = patch(state[key], val);
            } else {
                state[key] = val;
            }
        }
    }

    return state;
}
