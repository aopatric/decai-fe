import asyncio
import json
import os
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCDataChannel, RTCConfiguration, RTCIceServer
import logging
from collections import defaultdict
from typing import Dict, Set
from enum import Enum
import time

class NodeState(Enum):
    CONNECTING = 1
    READY = 2
    DISCONNECTING = 3

logging.basicConfig(level=logging.INFO)

class TorusNode:
    def __init__(self, signaling_server: str):
        self.signaling_server = signaling_server
        self.websocket = None
        self.connections: Dict[int, RTCPeerConnection] = {}
        self.data_channels: Dict[int, RTCDataChannel] = {}
        self.rank = None
        self.neighbors = None
        self.state = NodeState.CONNECTING
        self.state_lock = asyncio.Lock()
        self.connection_queue = asyncio.Queue()
        self.connection_retries = defaultdict(int)
        self.MAX_RETRIES = 3
        self.RETRY_DELAY = 2
        self.pending_connections: Set[int] = set()
        self.connected_peers: Set[int] = set()
        self.expected_connections = 0
        self.connection_timeout = 30
        self.ice_gathering_timeout = 10
        self.logger = self.setup_logger()

    def setup_logger(self) -> logging.Logger:
        os.makedirs("logs", exist_ok=True)
        logger = logging.getLogger(f"Node")
        logger.setLevel(logging.INFO)
        logger.handlers.clear()
        return logger

    def setup_file_logging(self):
        if self.rank is not None:
            fh = logging.FileHandler(f"logs/client_{self.rank}.log")
            fh.setLevel(logging.INFO)
            formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s'
            )
            fh.setFormatter(formatter)
            self.logger = logging.getLogger(f"Node-{self.rank}")
            self.logger.handlers.clear()
            self.logger.addHandler(fh)
            ch = logging.StreamHandler()
            ch.setFormatter(formatter)
            self.logger.addHandler(ch)

    async def change_state(self, new_state: NodeState):
        async with self.state_lock:
            self.state = new_state
            self.logger.info(f"Node {self.rank} state changed to {new_state}")

    async def debug_connection_state(self, peer_rank: int):
        if peer_rank in self.connections:
            pc = self.connections[peer_rank]
            self.logger.info(f"Connection state with {peer_rank}:")
            self.logger.info(f"  Connection state: {pc.connectionState}")
            self.logger.info(f"  ICE connection state: {pc.iceConnectionState}")
            self.logger.info(f"  ICE gathering state: {pc.iceGatheringState}")
            self.logger.info(f"  Signaling state: {pc.signalingState}")
            
            if peer_rank in self.data_channels:
                channel = self.data_channels[peer_rank]
                self.logger.info(f"  Data channel state: {channel.readyState}")
        else:
            self.logger.info(f"No connection exists with peer {peer_rank}")

    async def setup_data_channel(self, channel: RTCDataChannel, peer_rank: int):
        self.data_channels[peer_rank] = channel

        @channel.on("open")
        def on_open():
            self.logger.info(f"Data channel opened with peer {peer_rank}")
            asyncio.create_task(self.on_peer_connected(peer_rank))
            asyncio.create_task(self.ping_loop(peer_rank))

        @channel.on("message")
        def on_message(message):
            try:
                data = json.loads(message)
                if data["type"] == "ping":
                    self.logger.info(f"{self.rank} Received ping from {peer_rank}")
                    channel.send(json.dumps({
                        "type": "pong",
                        "timestamp": data["timestamp"],
                        "respondedAt": time.time() * 1000
                    }))
                elif data["type"] == "pong":
                    rtt = time.time() * 1000 - data["timestamp"]
                    self.logger.info(f"{self.rank} Received pong from {peer_rank}, RTT: {rtt:.2f}ms")
            except json.JSONDecodeError:
                self.logger.error(f"Failed to parse message from {peer_rank}: {message}")

    async def on_peer_connected(self, peer_rank: int):
        self.connected_peers.add(peer_rank)
        self.pending_connections.discard(peer_rank)
        self.logger.info(f"Node {self.rank} connected to peer {peer_rank}. "
                    f"Connected: {len(self.connected_peers)}/{self.expected_connections}")
        
        # Notify signaling server about the established connection
        if self.websocket:
            await self.websocket.send(json.dumps({
                "type": "connection_established",
                "peerRank": peer_rank
            }))

    async def ping_loop(self, peer_rank: int):
        while self.state != NodeState.DISCONNECTING:
            if peer_rank in self.data_channels:
                channel = self.data_channels[peer_rank]
                if channel.readyState == "open":
                    channel.send(json.dumps({
                        "type": "ping",
                        "timestamp": time.time() * 1000
                    }))
            await asyncio.sleep(5)

    async def connection_worker(self):
        while True:
            try:
                target_rank = await self.connection_queue.get()
                self.logger.info(f"Node {self.rank} worker processing connection to {target_rank}")
                retry_count = self.connection_retries[target_rank]
                
                try:
                    await asyncio.wait_for(
                        self.initiate_connection(target_rank),
                        timeout=self.connection_timeout
                    )
                    self.logger.info(f"Node {self.rank} successfully initiated connection to {target_rank}")
                    self.connection_retries[target_rank] = 0
                except asyncio.TimeoutError:
                    self.logger.error(f"Connection timeout to {target_rank}")
                    await self.handle_connection_failure(target_rank)
                except Exception as e:
                    self.logger.error(f"Connection attempt to {target_rank} failed: {e}")
                    await self.handle_connection_failure(target_rank)
                finally:
                    self.connection_queue.task_done()
            except asyncio.CancelledError:
                break

    def create_peer_connection(self) -> RTCPeerConnection:
        config = RTCConfiguration([
            RTCIceServer(urls=[
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ])
        ])
        return RTCPeerConnection(configuration=config)

    async def initiate_connection(self, target_rank: int):
        try:
            pc = self.create_peer_connection()
            self.connections[target_rank] = pc
            
            @pc.on("iceconnectionstatechange")
            async def on_ice_connection_state_change():
                self.logger.info(f"ICE connection state to {target_rank}: {pc.iceConnectionState}")
                if pc.iceConnectionState == "failed":
                    self.logger.error(f"ICE connection to {target_rank} failed")
                    await self.handle_connection_failure(target_rank)
                elif pc.iceConnectionState == "connected":
                    self.logger.info(f"ICE connection to {target_rank} established")

            channel = pc.createDataChannel(f"chat-{self.rank}-{target_rank}")
            await self.setup_data_channel(channel, target_rank)
            
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            
            gathering_complete = asyncio.Event()
            
            @pc.on("icegatheringstatechange")
            async def on_gathering_complete():
                if pc.iceGatheringState == "complete":
                    gathering_complete.set()
            
            try:
                await asyncio.wait_for(gathering_complete.wait(), self.ice_gathering_timeout)
            except asyncio.TimeoutError:
                self.logger.warning(f"ICE gathering timed out for {target_rank}")
                
            await self.send_signaling(target_rank, {
                "type": "offer",
                "sdp": pc.localDescription.sdp
            })

        except Exception as e:
            self.logger.error(f"Failed to initiate connection to {target_rank}: {e}")
            await self.cleanup_connection(target_rank)
            raise

    async def cleanup_connection(self, rank: int):
        try:
            if rank in self.connections:
                pc = self.connections[rank]
                
                if rank in self.data_channels:
                    channel = self.data_channels[rank]
                    if channel and channel.readyState != "closed":
                        channel.close()
                    del self.data_channels[rank]
                
                for transceiver in pc.getTransceivers():
                    await transceiver.stop()
                
                await pc.close()
                del self.connections[rank]
            
            self.pending_connections.discard(rank)
            self.connected_peers.discard(rank)
            
            self.logger.info(f"Cleaned up connection to peer {rank}")
            
        except Exception as e:
            self.logger.error(f"Error during connection cleanup for peer {rank}: {e}")

    async def handle_connection_failure(self, target_rank):
        retry_count = self.connection_retries[target_rank]
        if retry_count < self.MAX_RETRIES:
            self.connection_retries[target_rank] = retry_count + 1
            await asyncio.sleep(self.RETRY_DELAY * (retry_count + 1))
            if target_rank not in self.connected_peers:
                await self.cleanup_connection(target_rank)
                await self.connection_queue.put(target_rank)
                self.logger.info(f"Retrying connection to {target_rank}, attempt {retry_count + 1}")
        else:
            self.logger.error(f"Max retries reached for {target_rank}")
            await self.cleanup_connection(target_rank)

    async def handle_signaling_message(self, message):
        try:
            if message["type"] == "topology":
                await self.handle_topology(message)
                return
            elif message["type"] == "network_ready":
                await self.change_state(NodeState.READY)
                return
                
            sender_rank = message["senderRank"]
            data = message["data"]
            
            if sender_rank not in self.connections:
                pc = self.create_peer_connection()
                self.connections[sender_rank] = pc
                
                @pc.on("datachannel")
                def on_datachannel(channel):
                    asyncio.create_task(self.setup_data_channel(channel, sender_rank))
                    
                @pc.on("icecandidate")
                def on_icecandidate(event):
                    if event:
                        asyncio.create_task(self.send_signaling(sender_rank, {
                            "type": "candidate",
                            "candidate": {
                                "sdpMid": event.sdpMid,
                                "sdpMLineIndex": event.sdpMLineIndex,
                                "candidate": event.candidate
                            }
                        }))
            
            pc = self.connections[sender_rank]
            
            if data["type"] == "offer":
                self.logger.info(f"Received offer from {sender_rank}")
                await pc.setRemoteDescription(RTCSessionDescription(
                    sdp=data["sdp"],
                    type="offer"
                ))
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await self.send_signaling(sender_rank, {
                    "type": "answer",
                    "sdp": pc.localDescription.sdp
                })
                
            elif data["type"] == "answer":
                self.logger.info(f"Received answer from {sender_rank}")
                await pc.setRemoteDescription(RTCSessionDescription(
                    sdp=data["sdp"],
                    type="answer"
                ))
                
            elif data["type"] == "candidate":
                self.logger.info(f"Received ICE candidate from {sender_rank}")
                try:
                    candidate = data["candidate"]
                    await pc.addIceCandidate({
                        "sdpMid": candidate["sdpMid"],
                        "sdpMLineIndex": candidate["sdpMLineIndex"],
                        "candidate": candidate["candidate"]
                    })
                except Exception as e:
                    self.logger.error(f"Error adding ICE candidate: {e}")
                
        except Exception as e:
            self.logger.error(f"Error handling signaling message: {e}")
            self.logger.error(f"Message was: {message}")

    async def connect(self):
        async with websockets.connect(self.signaling_server) as websocket:
            self.websocket = websocket
            await self.change_state(NodeState.CONNECTING)
            
            # Send initial ready message with client type
            await websocket.send(json.dumps({
                "type": "ready",
                "clientType": "python"
            }))
            
            workers = [self.connection_worker() for _ in range(3)]
            worker_tasks = [asyncio.create_task(w) for w in workers]
            
            try:
                while True:
                    message = await websocket.recv()
                    data = json.loads(message)
                    self.logger.info(f"Node received message: {data['type']}")
                    await self.handle_signaling_message(data)
                    
            except Exception as e:
                self.logger.error(f"Error in main loop: {e}")
            finally:
                for task in worker_tasks:
                    task.cancel()
                await self.change_state(NodeState.DISCONNECTING)

    async def handle_topology(self, data):
        self.rank = data["rank"]
        self.setup_file_logging()
        self.neighbors = data["neighbors"]
        self.logger.info(f"Node {self.rank} received topology. Neighbors: {self.neighbors}")

        # Clean up any old connections that aren't in the new topology
        current_neighbors = set(self.neighbors.values())
        old_connections = set(self.connections.keys())
        for rank in old_connections - current_neighbors:
            await self.cleanup_connection(rank)

        self.expected_connections = len(self.neighbors)

        # Only initiate connections to higher-ranked neighbors
        for neighbor_rank in self.neighbors.values():
            if neighbor_rank > self.rank:
                if (neighbor_rank not in self.connections and 
                    neighbor_rank not in self.pending_connections):
                    self.logger.info(f"Node {self.rank} queueing connection to {neighbor_rank}")
                    await self.connection_queue.put(neighbor_rank)
                    self.pending_connections.add(neighbor_rank)

        # debug loop
        async def debug_loop():
            while self.state != NodeState.DISCONNECTING:
                for neighbor_rank in self.neighbors.values():
                    await self.debug_connection_state(neighbor_rank)
                await asyncio.sleep(5)
        
        asyncio.create_task(debug_loop())

    async def send_signaling(self, target_rank: int, data: dict):
        if self.websocket:
            await self.websocket.send(json.dumps({
                "type": "signal",
                "targetRank": target_rank,
                "data": data
            }))

async def main():
    node = TorusNode("ws://localhost:8080")
    await node.connect()

if __name__ == "__main__":
    asyncio.run(main())