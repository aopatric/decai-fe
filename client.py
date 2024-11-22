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
        self.expected_connections = 0  # Track how many connections we expect
        self.connection_timeout = 30  # Timeout in seconds for connection attempts
        self.ice_gathering_timeout = 10 # Timeout in seconds for ICE gathering
        self.logger = self.setup_logger()

    def setup_logger(self) -> logging.Logger:
        # Create logs directory if it doesn't exist
        os.makedirs("logs", exist_ok=True)
        
        # Create a logger for this instance
        logger = logging.getLogger(f"Node")  # Will be updated with rank later
        logger.setLevel(logging.INFO)
        
        # Remove any existing handlers
        logger.handlers.clear()
        
        # We'll add the file handler when we get our rank
        return logger

    def setup_file_logging(self):
        if self.rank is not None:
            # Create file handler
            fh = logging.FileHandler(f"logs/client_{self.rank}.log")
            fh.setLevel(logging.INFO)
            
            # Create formatter
            formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s'
            )
            fh.setFormatter(formatter)
            
            # Add rank to logger name
            self.logger = logging.getLogger(f"Node-{self.rank}")
            
            # Add handler
            self.logger.handlers.clear()  # Remove any existing handlers
            self.logger.addHandler(fh)
            
            # Add console handler as well
            ch = logging.StreamHandler()
            ch.setFormatter(formatter)
            self.logger.addHandler(ch)

    async def change_state(self, new_state: NodeState):
        async with self.state_lock:
            self.state = new_state
            self.logger.info(f"Node {self.rank} state changed to {new_state}")

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
                logging.error(f"Failed to parse message from {peer_rank}: {message}")

    async def on_peer_connected(self, peer_rank: int):
        self.connected_peers.add(peer_rank)
        self.pending_connections.discard(peer_rank)
        self.logger.info(f"Node {self.rank} connected to peer {peer_rank}. "
                    f"Connected: {len(self.connected_peers)}/{self.expected_connections}")
        
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
                    logging.error(f"Connection timeout to {target_rank}")
                    await self.handle_connection_failure(target_rank)
                except Exception as e:
                    logging.error(f"Connection attempt to {target_rank} failed: {e}")
                    await self.handle_connection_failure(target_rank)
                finally:
                    self.connection_queue.task_done()
            except asyncio.CancelledError:
                break

    def create_peer_connection(self) -> RTCPeerConnection:
        config = RTCConfiguration([
            # For local testing, prioritize host candidates
            RTCIceServer(urls=[
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ])
        ])
        # Create peer connection with the configuration
        pc = RTCPeerConnection(configuration=config)
        return pc

    async def initiate_connection(self, target_rank: int):
        try:
            pc = self.create_peer_connection()
            self.connections[target_rank] = pc
            
            @pc.on("iceconnectionstatechange")
            async def on_ice_connection_state_change():
                self.logger.info(f"ICE connection state to {target_rank}: {pc.iceConnectionState}")
                if pc.iceConnectionState == "failed":
                    logging.error(f"ICE connection to {target_rank} failed")
                    await self.handle_connection_failure(target_rank)
                elif pc.iceConnectionState == "connected":
                    self.logger.info(f"ICE connection to {target_rank} established")

            @pc.on("icegatheringstatechange")
            async def on_ice_gathering_state_change():
                self.logger.info(f"ICE gathering state for {target_rank}: {pc.iceGatheringState}")

            # Create data channel first
            channel = pc.createDataChannel(f"chat-{self.rank}-{target_rank}")
            await self.setup_data_channel(channel, target_rank)
            
            # Create and set local description
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            
            # Wait for ICE gathering or timeout
            gathering_complete = asyncio.Event()
            
            @pc.on("icegatheringstatechange")
            async def on_gathering_complete():
                if pc.iceGatheringState == "complete":
                    gathering_complete.set()
            
            try:
                await asyncio.wait_for(gathering_complete.wait(), self.ice_gathering_timeout)
            except asyncio.TimeoutError:
                logging.warning(f"ICE gathering timed out for {target_rank}")
                
            # Send offer
            await self.send_signaling(target_rank, {
                "type": "offer",
                "sdp": pc.localDescription.sdp
            })

        except Exception as e:
            logging.error(f"Failed to initiate connection to {target_rank}: {e}")
            await self.cleanup_connection(target_rank)
            raise

    async def cleanup_connection(self, rank: int):
        try:
            if rank in self.connections:
                pc = self.connections[rank]
                
                # Close data channel first
                if rank in self.data_channels:
                    channel = self.data_channels[rank]
                    if channel and channel.readyState != "closed":
                        channel.close()
                    del self.data_channels[rank]
                
                # Stop all transceivers
                for transceiver in pc.getTransceivers():
                    await transceiver.stop()
                
                # Close the peer connection
                await pc.close()
                
                # Remove from connections
                del self.connections[rank]
            
            if rank in self.pending_connections:
                self.pending_connections.remove(rank)
            if rank in self.connected_peers:
                self.connected_peers.remove(rank)
                
            self.logger.info(f"Cleaned up connection to peer {rank}")
            
        except Exception as e:
            logging.error(f"Error during connection cleanup for peer {rank}: {e}")

    async def handle_connection_failure(self, target_rank):
        retry_count = self.connection_retries[target_rank]
        if retry_count < self.MAX_RETRIES:
            self.connection_retries[target_rank] = retry_count + 1
            await asyncio.sleep(self.RETRY_DELAY * (retry_count + 1))
            if target_rank not in self.connected_peers:
                await self.cleanup_connection(target_rank)  # Clean up before retrying
                await self.connection_queue.put(target_rank)
                self.logger.info(f"Retrying connection to {target_rank}, attempt {retry_count + 1}")
        else:
            logging.error(f"Max retries reached for {target_rank}")
            await self.cleanup_connection(target_rank)

    async def handle_signaling_message(self, message):
        try:
            sender_rank = message["senderRank"]
            data = message["data"]
            
            if sender_rank not in self.connections:
                pc = RTCPeerConnection(configuration=RTCConfiguration(
                    iceServers=[RTCIceServer(urls="stun:stun.l.google.com:19302")]
                ))
                self.connections[sender_rank] = pc
                
                @pc.on("datachannel")
                def on_datachannel(channel):
                    asyncio.create_task(self.setup_data_channel(channel, sender_rank))
                    
                @pc.on("icecandidate")
                async def on_icecandidate(candidate):
                    if candidate:
                        await self.send_signaling(sender_rank, {
                            "type": "candidate",
                            "candidate": candidate.sdp
                        })
            
            pc = self.connections[sender_rank]
            
            if data["type"] == "offer":
                if pc.signalingState != "stable":
                    await pc.setLocalDescription(await pc.createAnswer())
                    await pc.setRemoteDescription(RTCSessionDescription(
                        sdp=data["sdp"],
                        type="offer"
                    ))
                else:
                    await pc.setRemoteDescription(RTCSessionDescription(
                        sdp=data["sdp"],
                        type="offer"
                    ))
                    answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    await self.send_signaling(sender_rank, {
                        "type": "answer",
                        "sdp": answer.sdp
                    })
                
            elif data["type"] == "answer":
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(
                        sdp=data["sdp"],
                        type="answer"
                    ))
                
            elif data["type"] == "candidate" and pc.remoteDescription:
                await pc.addIceCandidate({
                    "sdp": data["candidate"],
                    "sdpMLineIndex": 0,
                    "sdpMid": "0"
                })
        except Exception as e:
            logging.error(f"Error handling signaling message from {sender_rank}: {e}")

    async def connect(self):
        async with websockets.connect(self.signaling_server) as websocket:
            self.websocket = websocket
            await self.change_state(NodeState.CONNECTING)
            
            await websocket.send(json.dumps({
                "type": "ready",
                "clientType": "python"
            }))
            
            # Start connection workers
            workers = [self.connection_worker() for _ in range(3)]
            worker_tasks = [asyncio.create_task(w) for w in workers]
            
            try:
                async def process_messages():
                    while True:
                        message = await websocket.recv()
                        data = json.loads(message)
                        self.logger.info(f"Node received message: {data['type']}")
                        
                        if data["type"] == "topology":
                            await self.handle_topology(data)
                        elif data["type"] == "signal":
                            await self.handle_signaling_message(data)
                        elif data["type"] == "network_ready":
                            await self.change_state(NodeState.READY)
                            return  # Exit the message processing loop when network is ready
                
                await process_messages()
                
            except Exception as e:
                logging.error(f"Error in main loop: {e}")
            finally:
                for task in worker_tasks:
                    task.cancel()
                await self.change_state(NodeState.DISCONNECTING)

    async def handle_topology(self, data):
        self.rank = data["rank"]
        self.setup_file_logging()
        new_neighbors = data["neighbors"]
        self.logger.info(f"Node {self.rank} received topology. Neighbors: {new_neighbors}")

        if self.neighbors:
            removed = set(self.neighbors.values()) - set(new_neighbors.values())
            for rank in removed:
                await self.cleanup_connection(rank)

        self.neighbors = new_neighbors
        self.expected_connections = len(new_neighbors)

        # Only initiate connections to higher-ranked neighbors
        connection_tasks = []
        for neighbor_rank in self.neighbors.values():
            if neighbor_rank > self.rank:
                if (neighbor_rank not in self.connections and 
                    neighbor_rank not in self.pending_connections):
                    self.logger.info(f"Node {self.rank} queueing connection to {neighbor_rank}")
                    await self.connection_queue.put(neighbor_rank)
                    self.pending_connections.add(neighbor_rank)

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
