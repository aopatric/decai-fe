/*

Session Handling

*/

import { TorusNode } from './torusNode.js';

let node = null;

export function createSession() {
    const maxClients = document.getElementById('maxClients').value;
    const sessionId = document.getElementById('sessionId').value || generateSessionId();
    document.getElementById('sessionId').value = sessionId;

    node = new TorusNode('ws://localhost:8080');
    node.connect({
        type: 'create_session',
        sessionId: sessionId,
        maxClients: parseInt(maxClients)
    });
}

export function joinSession() {
    const sessionId = document.getElementById('joinSessionId').value;
    if (!sessionId) {
        alert('Please enter a session code');
        return;
    }

    node = new TorusNode('ws://localhost:8080');
    node.connect({
        type: 'join_session',
        sessionId: sessionId
    });
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Hide the forms once connected
export function hideSessionForms() {
    document.getElementById('sessionForm').style.display = 'none';
    document.getElementById('joinForm').style.display = 'none';
}

export function getNode() {
    return node;
}