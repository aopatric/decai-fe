// logging helper
export function log(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `${new Date().toISOString()} - ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;

    if (type === 'info') {
        console.log(message);
    } else {
        console.error(message);
    }
}

// update status on main display
export function updateStatus(message) {
    document.getElementById('status').textContent = `Status: ${message}`;
}

// max idx of array helper (this doesn't exist???)
export function argmax(arr) {
    if(arr.length === 0) {
        throw new Error;
    }

    let maxIndex = 0;
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > arr[maxIndex]) {
            maxIndex = i;
        }
    }
    return maxIndex;
}