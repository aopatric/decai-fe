const { PeerServer } = require('peer');
const WebSocket = require('ws');

class Node {
    constructor(ws, rank, clientType) {
        this.ws = ws;
        this.rank = rank;
        this.clientType = clientType;
        this.neighbors = {};
        this.isReady = false;
    }
}

class SignalingServer {
    constructor(wsPort = 8080, peerPort = 9000) {
        this.wsPort = wsPort;
        this.peerPort = peerPort;
        this.nodes = new Map();
        this.rankCounter = 0;
        this.setupServers();
    }

    setupServers() {
        // Setup WebSocket server
        this.wss = new WebSocket.Server({ port: this.wsPort });
        console.log(`WebSocket signaling server running on ws://localhost:${this.wsPort}`);

        // Setup PeerJS server
        this.peerServer = PeerServer({ port: this.peerPort, path: '/myapp' });
        console.log(`PeerJS server running on ws://localhost:${this.peerPort}/myapp`);

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.wss.on('connection', this.handleConnection.bind(this));
        
        this.peerServer.on('connection', (client) => {
            console.log(`PeerJS client connected: ${client.id}`);
        });

        this.peerServer.on('disconnect', (client) => {
            console.log(`PeerJS client disconnected: ${client.id}`);
        });
    }

    async handleConnection(ws) {
        let node = null;

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                console.log('Received message:', data.type);

                switch (data.type) {
                    case 'ready':
                        node = new Node(ws, this.rankCounter++, data.clientType);
                        this.nodes.set(node.rank, node);
                        console.log(`Node ${node.rank} (${node.clientType}) connected`);
                        await this.updateTopology();
                        break;

                    case 'signal':
                        if (node && this.nodes.has(data.targetRank)) {
                            const targetNode = this.nodes.get(data.targetRank);
                            await this.forwardSignal(targetNode, {
                                type: 'signal',
                                senderRank: node.rank,
                                data: data.data
                            });
                        }
                        break;

                    case 'connection_established':
                        if (node) {
                            console.log(`Connection established between ${node.rank} and ${data.peerRank}`);
                            await this.checkNetworkReady();
                        }
                        break;
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        ws.on('close', async () => {
            if (node) {
                console.log(`Node ${node.rank} disconnected`);
                this.nodes.delete(node.rank);
                await this.updateTopology();
            }
        });
    }

    async updateTopology() {
        const ranks = Array.from(this.nodes.keys()).sort((a, b) => a - b);
        
        // Create a ring topology
        for (const rank of ranks) {
            const node = this.nodes.get(rank);
            const nodeCount = ranks.length;
            
            // In a ring, each node connects to its neighbors
            const leftNeighbor = (rank - 1 + nodeCount) % nodeCount;
            const rightNeighbor = (rank + 1) % nodeCount;
            
            node.neighbors = {
                left: ranks[leftNeighbor],
                right: ranks[rightNeighbor]
            };

            // Send topology update to the node
            await this.sendToNode(node, {
                type: 'topology',
                rank: node.rank,
                neighbors: node.neighbors
            });
        }
    }

    async checkNetworkReady() {
        // Check if all nodes have established their required connections
        let allNodesConnected = true;
        
        for (const [rank, node] of this.nodes.entries()) {
            const expectedConnections = Object.values(node.neighbors).length;
            // For now, we'll assume nodes report their connections properly
            // In a production system, you'd want to track this more carefully
            
            if (!node.isReady) {
                allNodesConnected = false;
                break;
            }
        }

        if (allNodesConnected) {
            // Notify all nodes that the network is ready
            for (const node of this.nodes.values()) {
                await this.sendToNode(node, {
                    type: 'network_ready'
                });
            }
        }
    }

    async sendToNode(node, message) {
        if (node.ws.readyState === WebSocket.OPEN) {
            node.ws.send(JSON.stringify(message));
        }
    }

    async forwardSignal(targetNode, message) {
        await this.sendToNode(targetNode, message);
    }
}

// Start the server
const server = new SignalingServer();