# signaling_server.py
import asyncio
import websockets

connected = set()

async def signaling(websocket):
    # Register client
    connected.add(websocket)
    try:
        async for message in websocket:
            # Broadcast to other connected clients
            for conn in connected:
                if conn != websocket:
                    await conn.send(message)
    finally:
        connected.remove(websocket)

async def main():
    async with websockets.serve(signaling, "localhost", 8765):
        await asyncio.Future()  # run forever

# Run the WebSocket server within an event loop
asyncio.run(main())
