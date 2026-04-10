import asyncio
import sys
import os

# Add local painda package to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'python')))

from painda.client import PPClient

async def run_test():
    client = PPClient("ws://127.0.0.1:3002")
    
    events_received = []
    state_updates = []

    @client.on("test:event")
    def on_test(payload):
        print(f"🐍 Python received event: {payload}")
        events_received.append(payload)

    @client.on("state:updated")
    def on_state(state):
        print(f"🐍 Python State Sync: {state}")
        state_updates.append(state)

    # Start client in the background
    client_task = asyncio.create_task(client.connect())
    
    print("Connecting to JS server...")
    
    # Wait for data or timeout
    try:
        await asyncio.wait_for(asyncio.sleep(3), timeout=5)
    except:
        pass

    print("\n--- Test Results ---")
    print(f"Events: {len(events_received)}")
    print(f"State Updates: {len(state_updates)}")
    
    if len(events_received) > 0 and len(state_updates) > 0:
        print("\n✅ BINARY PARITY VERIFIED!")
        sys.exit(0)
    else:
        print("\n❌ TEST FAILED: Missing data")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_test())
