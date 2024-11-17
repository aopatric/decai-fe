const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });
let nodes = {}; // Store each node's data with rank as the key
let rankCounter = 0; // Track unique ranks for nodes

console.log("Signaling server running on ws://localhost:8080");

wss.on('connection', (ws) => {
    const rank = rankCounter++;
    const ip = ws._socket.remoteAddress;
    const port = ws._socket.remotePort;

    nodes[rank] = ws;

    // Send the initial handshake response
    const initialResponse = {
        rank: rank,
        peers: Object.keys(nodes).reduce((peers, key) => {
            peers[key] = { ip, port };
            return peers;
        }, {}),
    };
    ws.send(JSON.stringify(initialResponse));

    // Handle incoming messages (e.g., weight sharing)
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'weights') {
            const { to, data: weights } = data;
            const targetClient = nodes[to];

            if (targetClient) {
                console.log(`Forwarding weights from ${rank} to ${to}`);
                targetClient.send(JSON.stringify({ type: 'weights', data: weights, from: rank }));
            }
        }
    });

    // Handle node disconnection
    ws.on('close', () => {
        delete nodes[rank];
        console.log(`Node ${rank} disconnected.`);
    });
});
