# @painda/gaming — Delta-Engine & Integration mit Typed Rooms

## 1. Öffentliche API

Alle über `packages/gaming/src/index.ts` exportierten Symbole:

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `diff` | Funktion | Berechnet Delta zwischen zwei States (tiefe Rekursion); gelöschte Keys werden mit `PP_DELETED` markiert. |
| `PP_DELETED`, `isDeleted` | Konstante / Funktion | Sentinel für gelöschte Keys; Type-Guard. |
| `PPDeletedMarker` | Typ | Typ des Deletion-Sentinels. |
| `patch` | Funktion | Wendet ein Delta auf ein bestehendes State-Objekt an (in-place). |
| `StateManager` | Klasse | Hält State, bietet `update()`, `getState()`, `getDelta()`. |

---

## 2. Delta-Engine im Detail

### 2.1 `diff(oldState, newState)`

- **Rückgabe**: Delta-Objekt mit nur geänderten Pfaden, oder `undefined` wenn keine Änderung.
- **Regeln**:
  - Identität: `oldState === newState` → `undefined`.
  - Keine Plain-Objects (z. B. Date, RegExp, ArrayBuffer): gesamter Wert wird ersetzt.
  - Arrays: aktuell ganzheitlicher Vergleich; bei Unterschied wird das komplette neue Array zurückgegeben (kein Array-Splice).
  - Plain-Objects: rekursiver Vergleich; neue Keys → im Delta; gelöschte Keys → Wert `PP_DELETED`.
- **Performance**: Für 60 FPS ausgelegt; nutzt `for...in` und `hasOwnProperty`, vermeidet unnötige Allokationen.

### 2.2 `patch(state, delta)`

- **Modifikation**: `state` wird in-place verändert.
- **Regeln**:
  - `delta === undefined` → kein Effekt.
  - Delta ist kein Objekt (Primitive, Array, Date, null) → State wird vollständig ersetzt.
  - Pro Key im Delta: bei `PP_DELETED` Key löschen; bei verschachteltem Objekt rekursiv patchen; sonst Wert zuweisen (inkl. Date, Array, null).

### 2.3 `StateManager<T>`

- **Zweck**: State lokal halten und Deltas für Sync ausgeben.
- **API**:
  - `update(newState: Partial<T> | ((state: T) => void))`: State mutieren (Objekt-Merge oder Updater-Funktion).
  - `getState(): T`: aktuellen State lesen.
  - `getDelta(): any`: Delta seit letztem Aufruf; danach wird intern ein Snapshot für den nächsten Vergleich aktualisiert. Bei erstem Aufruf oder wenn `lastState` null: voller State; sonst Ergebnis von `diff(lastState, state)`.
- **Implementierung**: Nutzt `structuredClone` für Snapshots; nach `getDelta()` wird `lastState` mit aktuellem State überschrieben.

---

## 3. Integration mit @painda/core (Typed Rooms)

Core’s `PPTypedRoom` hat eine eingebaute `diff`-Implementierung und die Option `diffAlgorithm: "shallow" | "deep" | ((prev, next) => any)`.

### 3.1 Server: Gaming-Diff in Typed Rooms nutzen

- **Option A – Custom-Diff**: Beim Erzeugen der Room `diffAlgorithm` auf die Gaming-`diff` setzen, damit Löschungen als `PP_DELETED` ins Delta kommen und Client-seitig mit `patch` konsistent anwendbar sind:

```ts
import { diff } from "@painda/gaming";
import { PPServer } from "@painda/core";

const server = new PPServer({ port: 7000 });
const room = server.roomManager.room("lobby-1", { players: {}, phase: "waiting" }, {
  diffAlgorithm: (prev, next) => diff(prev, next),
});
```

- **Option B – StateManager treiben**: Eigenes State-Objekt mit `StateManager` aus @painda/gaming verwalten und in einem Tick-Handler `getDelta()` aufrufen; Delta per `client.send({ type: "__pp_room_delta", payload: { room, delta } })` an Clients senden. Dann die Room-State-Updates aus dem gleichen State speisen (z. B. `room.setState(manager.getState())` nach `manager.update(...)`), oder die Room nur für Join/Leave nutzen und Deltas manuell versenden.

### 3.2 Client: Deltas anwenden

- Beim Empfang von `__pp_room_delta` (Event `roomDelta`): Payload enthält `room` und `delta`. Lokalen State mit `patch` aus @painda/gaming aktualisieren:

```ts
import { patch } from "@painda/gaming";

client.on("roomDelta", (payload) => {
  const { room, delta } = payload;
  patch(localStateByRoom[room], delta);
});
```

- Bei vollem State (`__pp_room_state`, Event `roomState`): State ersetzen (z. B. bei Join); danach nur noch Deltas mit `patch` anwenden.

### 3.3 Kompatibilität

- Core’s eingebauter „deep“-Diff markiert gelöschte Keys mit `null`; Gaming verwendet `PP_DELETED`. Wenn der Client `patch` aus Gaming nutzt, muss das Delta vom Server ebenfalls `PP_DELETED` für Löschungen liefern – daher Server-Seite `diffAlgorithm: (prev, next) => diff(prev, next)` aus @painda/gaming verwenden.
- Wenn Core-Diff (null für Deletes) und Gaming-`patch` gemischt werden, werden gelöschte Keys nicht entfernt (patch löscht nur bei `isDeleted(val)`).

---

## 4. Abhängigkeiten

- **peerDependency**: `@painda/core` ^0.1.0 (nur typisch für Verwendung im gleichen Stack; Gaming importiert Core nicht im Code).
- **Runtime**: Keine weiteren Abhängigkeiten; nur TS/JS.

---

## 5. DX und Public-API-Abgrenzung

- **Stabil**: `diff`, `patch`, `PP_DELETED`, `isDeleted`, `StateManager` — Kern-API für Delta-Sync.
- **Erweiterungen**: Array-Splice-Deltas (Phase 2+) in `diff.ts` erwähnt; dann evtl. neues Delta-Format oder Optionen, mit Rückwärtskompatibilität.
