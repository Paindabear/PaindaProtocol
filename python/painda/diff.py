from typing import Any, List, Optional, Union, Dict

PP_DELETED = {"__pp_deleted": True}

def is_deleted(val: Any) -> bool:
    return isinstance(val, dict) and val.get("__pp_deleted") is True

def apply_array_ops(arr: List[Any], ops: List[Dict[str, Any]]):
    # Ops are in descending index order
    for op in ops:
        idx = op.get("index")
        if op["op"] == "set":
            if idx < len(arr):
                arr[idx] = op["value"]
        elif op["op"] == "splice":
            delete_count = op.get("deleteCount", 0)
            items = op.get("items", [])
            arr[idx:idx+delete_count] = items

def patch(state: Any, delta: Any) -> Any:
    """
    Apply a PaindaProtocol delta patch to a state object.
    Matches the JS implementation in packages/gaming/src/patch.ts
    """
    if delta is None:
        return state

    # Handle Array Ops
    if isinstance(delta, dict) and "__pp_array_ops" in delta:
        if not isinstance(state, list):
            state = []
        apply_array_ops(state, delta["__pp_array_ops"])
        return state

    # Non-dictionary delta replaces state entirely
    if not isinstance(delta, dict):
        return delta

    # If state is not a patchable dictionary, start fresh
    if not isinstance(state, dict):
        state = {}

    for key, val in delta.items():
        if is_deleted(val):
            if key in state:
                del state[key]
        elif isinstance(val, dict) and "__pp_array_ops" not in val:
            # Nested object - deep merge
            if key not in state or not isinstance(state[key], dict):
                state[key] = {}
            state[key] = patch(state[key], val)
        else:
            # Primitive, array, or null - assign directly
            state[key] = val

    return state

def myers_diff(a: List[Any], b: List[Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Port of the Myers O(ND) diff algorithm used in PaindaProtocol.
    Returns ops in descending index order.
    """
    # For now, we use a simple full replacement if they differ, 
    # as Python clients mostly consume patches rather than producing them.
    # Full Myers port can be added if production in Python is required.
    if a == b:
        return None
    return [{"op": "splice", "index": 0, "deleteCount": len(a), "items": b}]
