import { isDeleted, isArrayOps, type ArrayOp } from "./diff.js";

function applyArrayOps(arr: unknown[], ops: ArrayOp[]): void {
    // Ops are in descending index order — safe to apply without offset tracking
    for (const op of ops) {
        if (op.op === "set") {
            arr[op.index] = op.value;
        } else if (op.op === "splice") {
            arr.splice(op.index, op.deleteCount, ...op.items);
        }
    }
}

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

    // Array ops marker — apply in-place
    if (isArrayOps(delta)) {
        if (!Array.isArray(state)) state = [];
        applyArrayOps(state as unknown[], delta.__pp_array_ops);
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

/**
 * Immutable variant of patch(). Creates a deep clone before applying the delta,
 * so the returned object is always a new reference.
 *
 * This is essential for React's state management, where mutating the previous
 * state object in-place will NOT trigger a re-render.
 *
 * @example
 * ```tsx
 * import { patchImmutable } from "@painda/gaming";
 *
 * client.on("game:delta", (delta) => {
 *   setGameState(prev => patchImmutable(prev, delta));
 * });
 * ```
 *
 * @param state The current state (will NOT be modified)
 * @param delta The delta patch containing changes
 * @returns A new object with the delta applied
 */
export function patchImmutable<T>(state: T, delta: any): T {
    if (delta === undefined) {
        return state;
    }
    const clone = structuredClone(state);
    return patch(clone, delta) as T;
}
