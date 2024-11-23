import { createSession, joinSession } from "./sessionManager.js";
import { log } from "./utils.js";
import "./styles.css";

function initApp() {
    // add the event listeners for the clicks of the buttons
    document.getElementById('createSessionBtn').addEventListener('click', createSession);
    document.getElementById('joinSessionBtn').addEventListener('click', joinSession);

    log('Application started...');
}

document.addEventListener('DOMContentLoaded', initApp);