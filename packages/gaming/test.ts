import { StateManager, patch } from "./src/index.js";

function assertDeepEqual(a: any, b: any) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`Assertion failed: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    }
}

interface Player { x: number; y: number; hp: number }
interface GameState {
    players: Record<string, Player>;
    score: number;
}

// 1. Initialize Server State
const serverState = new StateManager<GameState>({
    players: {
        "user1": { x: 10, y: 10, hp: 100 },
        "user2": { x: 20, y: 20, hp: 100 }
    },
    score: 0
});

// Client initial state
let clientState = JSON.parse(JSON.stringify(serverState.getState()));

// 2. Tick 1: Update positions
serverState.update((state) => {
    state.players["user1"].x = 12;
    state.score = 10;
});

const delta1 = serverState.getDelta();
console.log("Delta 1:", JSON.stringify(delta1));
assertDeepEqual(delta1, { players: { user1: { x: 12 } }, score: 10 });

// Client patches state
clientState = patch(clientState, delta1);
assertDeepEqual(clientState, serverState.getState());

// 3. Tick 2: Delete player and add new one
serverState.update((state) => {
    delete state.players["user2"];
    state.players["user3"] = { x: 0, y: 0, hp: 50 };
});

const delta2 = serverState.getDelta();
console.log("Delta 2:", JSON.stringify(delta2));
assertDeepEqual(delta2, { players: { user2: "__DELETED__", user3: { x: 0, y: 0, hp: 50 } } });

clientState = patch(clientState, delta2);
assertDeepEqual(clientState, serverState.getState());

// 4. Tick 3: Nested properties update
serverState.update((state) => {
    state.players["user1"].hp = 95;
});

const delta3 = serverState.getDelta();
console.log("Delta 3:", JSON.stringify(delta3));
assertDeepEqual(delta3, { players: { user1: { hp: 95 } } });

clientState = patch(clientState, delta3);
assertDeepEqual(clientState, serverState.getState());

console.log("All tests passed!");
