const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let nodes = {}; // Store each node's data with rank as the key
let rankCounter = 0; // Track unique ranks for nodes

console.log("Signaling server running on ws://localhost:8080");

wss.on('connection', (ws) => {
    const rank = rankCounter++;
    const ip = ws._socket.remoteAddress;
    const port = ws._socket.remotePort;

    nodes[rank] = { ip, port };

    // Send the initial handshake response
    const initialResponse = {
        rank: rank,
        peers: nodes  // Send current list of connected nodes
    };
    ws.send(JSON.stringify(initialResponse));

    // Broadcast updated peer list on new connection or disconnection
    broadcastPeerList();

    // Handle node disconnection
    ws.on('close', () => {
        delete nodes[rank];
        broadcastPeerList();
    });

    function broadcastPeerList() {
        const updatedPeers = JSON.stringify({ peers: nodes });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(updatedPeers);
            }
        });
    }
});
