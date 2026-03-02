import { diff } from "./diff.js";
import { patch } from "./patch.js";

/**
 * Manages the state and provides diffs (deltas) for synchronization.
 */
export class StateManager<T extends object> {
    private lastState: T | null = null;
    private state: T;

    constructor(initialState: T) {
        this.state = JSON.parse(JSON.stringify(initialState));
        this.lastState = JSON.parse(JSON.stringify(initialState));
    }

    /**
     * Updates the current state object. (Mutates the existing state)
     */
    public update(newState: Partial<T> | ((state: T) => void)): void {
        if (typeof newState === 'function') {
            const updater = newState as (state: T) => void;
            updater(this.state);
        } else {
            Object.assign(this.state, newState);
        }
    }

    /**
     * Returns the current full state.
     */
    public getState(): T {
        return this.state;
    }

    /**
     * Calculates the delta patch since the last time `getDelta()` was called.
     * If there are no changes, it returns `undefined`.
     */
    public getDelta(): any {
        if (!this.lastState) {
            this.lastState = JSON.parse(JSON.stringify(this.state));
            return this.state;
        }

        const delta = diff(this.lastState, this.state);

        // Once delta is retrieved, save the snapshot for the next tick
        this.lastState = JSON.parse(JSON.stringify(this.state));

        return delta;
    }
}
