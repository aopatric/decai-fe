import asyncio
import json
import websockets
import math
from dataclasses import dataclass
from typing import Dict, Set, Optional
import logging
from collections import defaultdict

logging.basicConfig(level=logging.INFO)

@dataclass
class ClientInfo:
    rank: int
    client_type: str
    ready: bool = False
    connected_peers: Set[int] = None
    
    def __post_init__(self):
        self.connected_peers = set()

class SignalingServer:
    def __init__(self, max_concurrent_connections=5):
        self.clients: Dict[websockets.WebSocketServerProtocol, ClientInfo] = {}
        self.next_rank = 0
        self.connection_semaphore = asyncio.Semaphore(max_concurrent_connections)
        self.connection_locks = defaultdict(asyncio.Lock)
        self.grid_size = 0
        
    def calculate_grid_size(self) -> int:
        return math.floor(math.sqrt(len(self.clients)))
        
    def get_neighbor_ranks(self, rank: int) -> dict:
        if self.grid_size < 2:
            return {}
            
        row = rank // self.grid_size
        col = rank % self.grid_size
        
        return {
            'north': ((row - 1 + self.grid_size) % self.grid_size) * self.grid_size + col,
            'south': ((row + 1) % self.grid_size) * self.grid_size + col,
            'west': row * self.grid_size + ((col - 1 + self.grid_size) % self.grid_size),
            'east': row * self.grid_size + ((col + 1) % self.grid_size)
        }

    async def handle_client(self, websocket: websockets.WebSocketServerProtocol):
        try:
            message = await websocket.recv()
            data = json.loads(message)
            
            if data['type'] == 'ready':
                async with self.connection_semaphore:
                    client_info = ClientInfo(
                        rank=self.next_rank,
                        client_type=data.get('clientType', 'javascript')
                    )
                    self.clients[websocket] = client_info
                    self.next_rank += 1
                    self.grid_size = self.calculate_grid_size()
                    
                    # Send initial topology
                    await self.broadcast_topology()
                    
                    logging.info(f"New {client_info.client_type} client connected with rank {client_info.rank}")
            
            async for message in websocket:
                data = json.loads(message)
                if data['type'] == 'signal':
                    sender_rank = self.clients[websocket].rank
                    target_rank = data['targetRank']
                    
                    # Use connection lock to prevent race conditions
                    async with self.connection_locks[f"{min(sender_rank, target_rank)}-{max(sender_rank, target_rank)}"]:
                        target_ws = next(
                            (ws for ws, info in self.clients.items() if info.rank == target_rank),
                            None
                        )
                        if target_ws:
                            await target_ws.send(json.dumps({
                                'type': 'signal',
                                'senderRank': sender_rank,
                                'senderType': self.clients[websocket].client_type,
                                'data': data['data']
                            }))
                elif data['type'] == 'connection_established':
                    peer_rank = data['peerRank']
                    self.clients[websocket].connected_peers.add(peer_rank)
                    
                    # Check if all expected connections are established
                    if len(self.clients[websocket].connected_peers) == 4:  # All neighbors connected
                        self.clients[websocket].ready = True
                        await self.check_network_ready()

        except websockets.exceptions.ConnectionClosed:
            logging.info(f"Client disconnected: rank {self.clients[websocket].rank}")
            await self.handle_disconnect(websocket)
        
    async def handle_disconnect(self, websocket):
        if websocket in self.clients:
            disconnected_rank = self.clients[websocket].rank
            del self.clients[websocket]
            self.grid_size = self.calculate_grid_size()
            
            # Reset connection state for affected neighbors
            for _, info in self.clients.items():
                if disconnected_rank in info.connected_peers:
                    info.connected_peers.remove(disconnected_rank)
                    info.ready = False
            
            await self.broadcast_topology()
            
    async def broadcast_topology(self):
        for ws, info in self.clients.items():
            neighbors = self.get_neighbor_ranks(info.rank)
            await ws.send(json.dumps({
                'type': 'topology',
                'rank': info.rank,
                'neighbors': neighbors,
                'gridSize': self.grid_size
            }))
            
    async def check_network_ready(self):
        all_ready = all(info.ready for info in self.clients.values())
        if all_ready:
            logging.info("All nodes connected and ready!")
            await self.broadcast_network_ready()
            
    async def broadcast_network_ready(self):
        message = json.dumps({'type': 'network_ready'})
        await asyncio.gather(*[
            ws.send(message) for ws in self.clients
        ])

async def main():
    server = SignalingServer()
    async with websockets.serve(server.handle_client, "localhost", 8080):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
