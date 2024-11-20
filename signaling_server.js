const { PeerServer } = require('peer');
const WebSocket = require('ws');

// Create a WebSocket signaling server
const wss = new WebSocket.Server({ port: 8080 });
const peerServer = PeerServer({ port: 9000, path: '/myapp' });

let nodes = {}; // Store each node's details with rank as the key
let rankCounter = 0; // Counter to assign unique ranks to each node

console.log("WebSocket signaling server running on ws://localhost:8080");
console.log("PeerJS server running on ws://localhost:9000/myapp");

// WebSocket server events
wss.on('connection', (ws) => {
  const rank = rankCounter++; // Assign a unique rank to each new node
  const ip = ws._socket.remoteAddress;
  const port = ws._socket.remotePort;

  // Add the node to the list
  nodes[rank] = { ip, port };

  console.log(`Node connected: Rank ${rank}, IP ${ip}, Port ${port}`);

  // Send initial handshake response with rank and peer list
  const initialResponse = {
    rank: rank,
    peers: nodes, // Include the current list of connected peers
  };
  ws.send(JSON.stringify(initialResponse));

  // Notify all peers about the updated peer list
  broadcastPeerList();

  // Handle node disconnection
  ws.on('close', () => {
    console.log(`Node disconnected: Rank ${rank}`);
    delete nodes[rank]; // Remove the node from the list
    broadcastPeerList(); // Update the peer list for all clients
  });

  // Handle messages from clients (e.g., weight exchange, etc.)
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log(`Message from Node Rank ${rank}:`, data);

    if (data.type === 'weights') {
      // Handle weight exchange logic (e.g., broadcast to a specific peer)
      const targetRank = data.to;
      const targetNode = nodes[targetRank];

      if (targetNode) {
        console.log(
          `Forwarding weights from Node Rank ${rank} to Node Rank ${targetRank}`
        );
        broadcastToPeer(targetRank, data);
      } else {
        console.log(`Target Node Rank ${targetRank} not found.`);
      }
    }
  });

  /**
   * Broadcast the updated peer list to all connected nodes
   */
  function broadcastPeerList() {
    const updatedPeers = JSON.stringify({ peers: nodes });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updatedPeers);
      }
    });
  }

  /**
   * Broadcast a message to a specific peer
   * @param {number} targetRank
   * @param {object} message
   */
  function broadcastToPeer(targetRank, message) {
    wss.clients.forEach((client) => {
      if (
        client.readyState === WebSocket.OPEN &&
        client._socket.remoteAddress === nodes[targetRank].ip &&
        client._socket.remotePort === nodes[targetRank].port
      ) {
        client.send(JSON.stringify(message));
      }
    });
  }
});

// PeerJS signaling server events
peerServer.on('connection', (client) => {
  console.log(`PeerJS client connected: ${client.id}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`PeerJS client disconnected: ${client.id}`);
});
