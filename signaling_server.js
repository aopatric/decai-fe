const WebSocket = require('ws');

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });
let nodes = {}; // Object to store each node's data with a unique rank as the key
let rankCounter = 0; // Counter to generate unique ranks for each node

console.log("Signaling server running on ws://localhost:8080");

wss.on('connection', (ws) => {
    const rank = rankCounter++; // Assign a unique rank to each new node
    const ip = ws._socket.remoteAddress; // Get IP address of the node
    const port = ws._socket.remotePort;   // Get port of the node

    // Store the node details with its rank
    nodes[rank] = { ip, port };

    console.log(`Node connected: Rank ${rank}, IP ${ip}, Port ${port}`);
    
    // Send initial handshake response to the client with rank and list of peers
    const initialResponse = {
        rank: rank,          // Assigned unique rank
        peers: nodes         // Current list of all connected nodes
    };
    ws.send(JSON.stringify(initialResponse));

    // Broadcast updated peer list to all clients when a new node connects
    broadcastPeerList();

    // Handle disconnection of the node
    ws.on('close', () => {
        console.log(`Node disconnected: Rank ${rank}`);
        delete nodes[rank];  // Remove the node from the list

        // Broadcast updated peer list to remaining clients
        broadcastPeerList();
    });
    
    // Function to broadcast updated peer list to all clients
    function broadcastPeerList() {
        const updatedPeers = JSON.stringify({ peers: nodes });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(updatedPeers);
            }
        });
    }
});
