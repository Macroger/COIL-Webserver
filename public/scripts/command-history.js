/**
 * Command History Module
 * Manages and displays command history log
 */

class CommandHistory {
    constructor() {
        this.history = [];
        this.maxEntries = 50; // Keep last 50 commands
        this.logElement = document.getElementById('commandLog');
        this.loadHistory();
    }

    /**
     * Add entry to command history
     */
    addEntry(entry) {
        // Add timestamp if not present
        if (!entry.timestamp) {
            entry.timestamp = new Date();
        }

        this.history.push(entry);

        // Limit history size
        if (this.history.length > this.maxEntries) {
            this.history.shift();
        }

        this.renderHistory();
        this.saveHistory();
    }

    /**
     * Render history to DOM
     */
    renderHistory() {
        // Clear current log
        this.logElement.innerHTML = '';

        if (this.history.length === 0) {
            this.logElement.innerHTML = '<p class="log-empty">No commands executed yet</p>';
            return;
        }

        // Render each entry (reverse order - newest first)
        [...this.history].reverse().forEach(entry => {
            const logEntry = this.createLogEntry(entry);
            this.logElement.appendChild(logEntry);
        });

        // Auto scroll to bottom
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    /**
     * Create a log entry DOM element
     */
    createLogEntry(entry) {
        const div = document.createElement('div');
        div.className = 'log-entry';

        const timestamp = entry.timestamp instanceof Date 
            ? entry.timestamp.toLocaleTimeString() 
            : new Date(entry.timestamp).toLocaleTimeString();

        let commandText = '';
        let statusText = '';

        if (entry.type === 'MOVE') {
            commandText = `MOVE ${entry.command.direction} ${entry.command.distance}m`;
        } else if (entry.type === 'TURN') {
            commandText = `TURN ${entry.command.direction} ${entry.command.angle}°`;
        } else if (entry.type === 'STOP') {
            commandText = 'STOP';
        } else if (entry.type === 'STATUS_REQUEST') {
            commandText = 'STATUS REQUEST';
        } else {
            commandText = entry.type;
        }

        statusText = entry.success ? '✓ OK' : '✗ FAILED';
        const statusClass = entry.success ? 'log-success' : 'log-error';

        div.innerHTML = `
            <div class="log-timestamp">${timestamp}</div>
            <div class="log-command">
                ${commandText}
                <span class="${statusClass}">${statusText}</span>
            </div>
        `;

        // Add click to see details
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => this.showDetails(entry));

        return div;
    }

    /**
     * Show detailed information about a command (can be extended)
     */
    showDetails(entry) {
        console.log('Command Details:', entry);
        // Could be extended to show a modal or toast notification
    }

    /**
     * Save history to localStorage
     */
    saveHistory() {
        try {
            localStorage.setItem('robotCommandHistory', JSON.stringify(this.history));
        } catch (error) {
            console.warn('Could not save history to localStorage:', error);
        }
    }

    /**
     * Load history from localStorage
     */
    loadHistory() {
        try {
            const stored = localStorage.getItem('robotCommandHistory');
            if (stored) {
                this.history = JSON.parse(stored) || [];
                // Enforce maxEntries in case stored history is larger than current limit
                if (this.history.length > this.maxEntries) {
                    this.history = this.history.slice(-this.maxEntries);
                    this.saveHistory();
                }
                this.renderHistory();
            }
        } catch (error) {
            console.warn('Could not load history from localStorage:', error);
            this.history = [];
        }
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.history = [];
        this.renderHistory();
        localStorage.removeItem('robotCommandHistory');
    }

    /**
     * Export history as JSON
     */
    exportAsJSON() {
        const dataStr = JSON.stringify(this.history, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `robot-history-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Export history as CSV
     */
    exportAsCSV() {
        let csv = 'Timestamp,Type,Command,Status\n';
        this.history.forEach(entry => {
            const timestamp = entry.timestamp instanceof Date 
                ? entry.timestamp.toISOString() 
                : entry.timestamp;
            const type = entry.type;
            const command = this.commandToString(entry);
            const status = entry.success ? 'OK' : 'FAILED';
            csv += `"${timestamp}","${type}","${command}","${status}"\n`;
        });

        const dataBlob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `robot-history-${new Date().toISOString().slice(0, 19)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Convert command object to string
     */
    commandToString(entry) {
        if (entry.type === 'MOVE' && entry.command) {
            return `MOVE ${entry.command.direction} ${entry.command.distance}m`;
        } else if (entry.type === 'TURN' && entry.command) {
            return `TURN ${entry.command.direction} ${entry.command.angle}°`;
        } else if (entry.type === 'STOP') {
            return 'STOP';
        } else if (entry.type === 'STATUS_REQUEST') {
            return 'STATUS REQUEST';
        }
        return entry.type;
    }

    /**
     * Get history statistics
     */
    getStats() {
        return {
            totalCommands: this.history.length,
            successCount: this.history.filter(e => e.success).length,
            failureCount: this.history.filter(e => !e.success).length,
            moveCount: this.history.filter(e => e.type === 'MOVE').length,
            turnCount: this.history.filter(e => e.type === 'TURN').length,
            stopCount: this.history.filter(e => e.type === 'STOP').length
        };
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    window.commandHistory = new CommandHistory();
});
