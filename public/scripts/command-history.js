/**
 * Command History Module
 * Manages and displays command history log
 */

class CommandHistory {
    constructor() {
        this.history = [];
        this.maxEntries = 50; // Keep last 50 commands
        this.logElement = document.getElementById('commandLog');
        this.btnHistory = document.getElementById('btnHistory');
        this.historyPanel = document.getElementById('historyPanel');
        this.btnCloseHistory = document.getElementById('btnCloseHistory');
        this.btnExportHistoryEl = document.getElementById('btnExportHistory');
        this.btnClearHistoryEl = document.getElementById('btnClearHistory');
        this.loadHistory();
        this.attachUI();
    }

    attachUI() {
        if (this.btnHistory && this.historyPanel) {
            this.btnHistory.addEventListener('click', () => {
                this.historyPanel.classList.toggle('visible');
                this.historyPanel.classList.toggle('hidden');
            });
        }
        if (this.btnCloseHistory && this.historyPanel) {
            this.btnCloseHistory.addEventListener('click', () => {
                this.historyPanel.classList.add('hidden');
                this.historyPanel.classList.remove('visible');
            });
        }
        if (this.btnExportHistoryEl) {
            this.btnExportHistoryEl.addEventListener('click', () => this.exportAsJSON());
        }
        if (this.btnClearHistoryEl) {
            this.btnClearHistoryEl.addEventListener('click', () => this.clearHistory());
        }
        // Inline open button in the right panel
        const inlineOpen = document.getElementById('btnOpenHistoryInline');
        if (inlineOpen && this.btnHistory) {
            inlineOpen.addEventListener('click', () => this.btnHistory.click());
        }
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
            const dir = entry.command?.direction || '';
            const dist = (entry.command && typeof entry.command.distance !== 'undefined') ? ` ${entry.command.distance}m` : '';
            commandText = `MOVE ${dir}${dist}`;
        } else if (entry.type === 'TURN') {
            const dir = entry.command?.direction || '';
            const ang = (entry.command && typeof entry.command.angle !== 'undefined') ? ` ${entry.command.angle}°` : '';
            commandText = `TURN ${dir}${ang}`;
        } else if (entry.type === 'STOP') {
            commandText = 'STOP';
        } else if (entry.type === 'STATUS_REQUEST') {
            commandText = 'STATUS REQUEST';
            const t = entry.response?.telemetry;
            if (t) {
                const cmdMap = { 1: 'DRIVE FORWARD', 2: 'DRIVE BACKWARD', 3: 'TURN RIGHT', 4: 'TURN LEFT' };
                const isTurn = t.last_command === 3 || t.last_command === 4;
                commandText += `<div class="log-telemetry">
                    <span>Pkt#${t.last_packet_counter}</span>
                    <span>Grade:${t.current_grade}%</span>
                    <span>Hits:${t.hit_count}</span>
                    <span>${isTurn ? 'TurnDur' : 'Hdg'}:${t.heading}${isTurn ? 's' : '°'}</span>
                    <span>Last Cmd:${cmdMap[t.last_command] ?? t.last_command}</span>
                    ${!isTurn ? `<span>Duration:${t.last_command_value}s</span><span>Power:${t.last_command_power}%</span>` : ''}
                </div>`;
            }
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
            const dir = entry.command.direction || '';
            const dist = (typeof entry.command.distance !== 'undefined') ? ` ${entry.command.distance}m` : '';
            return `MOVE ${dir}${dist}`;
        } else if (entry.type === 'TURN' && entry.command) {
            const dir = entry.command.direction || '';
            const ang = (typeof entry.command.angle !== 'undefined') ? ` ${entry.command.angle}°` : '';
            return `TURN ${dir}${ang}`;
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
