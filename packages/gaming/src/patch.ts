/**
 * Applies a delta patch to an existing state object.
 * Mutates the state object in-place for performance.
 * 
 * @param state The current state to be modified
 * @param patch The delta patch containing changes
 */
export function patch(state: any, delta: any): any {
    if (delta === undefined) {
        return state;
    }

    if (typeof delta !== "object" || delta === null || Array.isArray(delta)) {
        return delta;
    }

    if (typeof state !== "object" || state === null || Array.isArray(state)) {
        // State was a primitive but patch is an object, replace it
        // Wait, if patch applies to a primitive, state becomes the patch. But we mutate.
        // So we return the new state.
        state = Array.isArray(delta) ? [] : {};
    }

    for (const key in delta) {
        if (Object.prototype.hasOwnProperty.call(delta, key)) {
            const val = delta[key];
            if (val === "__DELETED__") {
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
