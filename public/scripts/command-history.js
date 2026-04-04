/**
 * Command History Module
 * Manages and displays command history log
 *
 * Behavior changes:
 * - Renders oldest-to-newest so newest entries appear at the bottom.
 * - Auto-scrolls only when view is near the bottom; otherwise marks the log as "stale".
 * - Shows a floating "Go to latest" button when not at the bottom.
 */

class CommandHistory {
    constructor() {
        this.history = [];
        this.maxEntries = 50; // Keep last 50 commands
        this.logElement = document.getElementById('commandLog');
        this.btnHistory = document.getElementById('btnHistory');
        // prefer an explicit id, fall back to the panel class
        this.historyPanel = document.getElementById('historyPanel') || document.querySelector('.history-panel');
        this.btnCloseHistory = document.getElementById('btnCloseHistory');
        this.btnExportHistoryEl = document.getElementById('btnExportHistory');
        this.btnClearHistoryEl = document.getElementById('btnClearHistory');

        // Create goto button and attach scroll handler early
        this.createGotoButton();
        this.attachScrollHandler();

        this.loadHistory();
        this.attachUI();
        // Re-evaluate layout on window resize to ensure the command log
        // and goto button recalculate correctly after viewport changes.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.handleWindowResize(), 150);
        });
        // cache command log element and default max-height
        this.commandLogEl = this.logElement;
        const computed = this.commandLogEl ? getComputedStyle(this.commandLogEl).maxHeight : null;
        this.defaultCommandLogMax = 340;
        if (computed && computed !== 'none') {
            const px = parseInt(computed.replace('px', ''), 10);
            if (!isNaN(px)) this.defaultCommandLogMax = px;
        }
    }

    handleWindowResize() {
        // Force a re-render so sizes and the goto button placement
        // are recomputed. Then keep the view scrolled to the bottom
        // if it was previously near the bottom.
        const wasNearBottom = this.logElement && (this.logElement.scrollHeight - (this.logElement.scrollTop + this.logElement.clientHeight) <= 40);
        this.renderHistory();
        if (this.logElement && wasNearBottom) {
            this.logElement.scrollTop = this.logElement.scrollHeight;
        }
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
        // Status cards collapse toggle (keeps behavior centralized)
        const btnToggleStatus = document.getElementById('btnToggleStatus');
        const statusCards = document.getElementById('statusCards');
        if (btnToggleStatus && statusCards) {
            btnToggleStatus.addEventListener('click', () => {
                const expanded = btnToggleStatus.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    statusCards.classList.add('collapsed');
                    btnToggleStatus.setAttribute('aria-expanded', 'false');
                    btnToggleStatus.title = 'Expand Status Cards';
                    // increase command log height by ~4 lines to fill the freed space
                    this.adjustCommandLogForStatus(false);
                } else {
                    statusCards.classList.remove('collapsed');
                    btnToggleStatus.setAttribute('aria-expanded', 'true');
                    btnToggleStatus.title = 'Collapse Status Cards';
                    // restore command log height
                    this.adjustCommandLogForStatus(true);
                }
            });
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

        // Update status cards
        const lastCard = document.getElementById('statusCardLast');
        if (lastCard) { const v = lastCard.querySelector('.value'); if (v) v.textContent = entry.timestamp ? entry.timestamp.toLocaleTimeString() : '--'; }
        const cmdCard = document.getElementById('statusCardLastCmd');
        if (cmdCard) {
            const v = cmdCard.querySelector('.value');
            if (v) {
                let label = entry.type || '--';
                if (entry.command && entry.command.direction) label += ' ' + entry.command.direction;
                v.textContent = label.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            }
        }
    }

    /**
     * Render history to DOM
     */
    renderHistory() {
        if (!this.logElement) return;

        // remember if view was near bottom so we can preserve auto-scroll
        const nearBottomBefore = (this.logElement.scrollHeight - (this.logElement.scrollTop + this.logElement.clientHeight) <= 20);

        // Clear current log
        this.logElement.innerHTML = '';

        if (this.history.length === 0) {
            this.logElement.innerHTML = '<p class="log-empty">No commands executed yet</p>';
            return;
        }

        // Render entries oldest-first so newest appear at the bottom
        this.history.forEach(entry => {
            const logEntry = this.createLogEntry(entry);
            this.logElement.appendChild(logEntry);
        });

        // Re-attach goto button since we clear innerHTML above which removes it
        if (this.gotoBtn) {
            // Append to .history-section which has position:relative so absolute
            // positioning anchors correctly to the bottom-center of the log area.
            const target = (this.logElement && this.logElement.closest('.history-section'))
                || this.historyPanel
                || this.logElement;
            target.appendChild(this.gotoBtn);
            this.gotoBtn.style.zIndex = '999';
        }

        // If view was near bottom before update, auto-scroll to bottom; otherwise mark as stale
        if (nearBottomBefore) {
            this.logElement.scrollTop = this.logElement.scrollHeight;
        } else {
            this.logElement.classList.add('stale');
            if (this.gotoBtn) this.gotoBtn.style.display = 'block';
        }
        this.updateStaleState();
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

    /* --- Stale indicator and goto button --- */
    createGotoButton() {
        if (!this.logElement) return;
        const btn = document.createElement('button');
        btn.className = 'goto-latest';
        btn.textContent = 'Go to latest';
        btn.title = 'Go to latest message';
        btn.style.display = 'none';
        btn.addEventListener('click', () => {
            this.logElement.scrollTop = this.logElement.scrollHeight;
            this.logElement.classList.remove('stale');
            btn.style.display = 'none';
        });
        this.gotoBtn = btn;
        // Do not append the button into the scrolling log (that causes layout shifts).
        // It will be appended into the non-scrolling history panel (or kept un-attached)
        // and positioned absolutely via CSS so it doesn't affect container height.
    }

    attachScrollHandler() {
        if (!this.logElement) return;
        this.logElement.addEventListener('scroll', () => {
            this.updateStaleState();
        }, { passive: true });
    }

    updateStaleState() {
        if (!this.logElement) return;
        const distance = this.logElement.scrollHeight - (this.logElement.scrollTop + this.logElement.clientHeight);
        const atBottom = distance <= 20;
        if (atBottom) {
            this.logElement.classList.remove('stale');
            if (this.gotoBtn) this.gotoBtn.style.display = 'none';
        } else {
            this.logElement.classList.add('stale');
            if (this.gotoBtn) this.gotoBtn.style.display = 'block';
        }
    }

    /* Adjust the command log max-height when status cards are toggled.
       When `expanded === false` (status cards collapsed) we increase the
       max-height by approximately 4 lines so the command log fills the
       freed vertical space. When `expanded === true` we restore the
       original max. */
    adjustCommandLogForStatus(expanded) {
        if (!this.commandLogEl) return;
        // determine an approximate line height using one log entry if available
        let lineHeight = 34; // fallback
        const sample = this.commandLogEl.querySelector('.log-entry');
        if (sample) {
            const rect = sample.getBoundingClientRect();
            lineHeight = Math.max(24, Math.round(rect.height));
        }
        const delta = Math.round(lineHeight * 4);
        if (expanded) {
            this.commandLogEl.style.maxHeight = this.defaultCommandLogMax + 'px';
        } else {
            this.commandLogEl.style.maxHeight = (this.defaultCommandLogMax + delta) + 'px';
        }
        // If the view was near the bottom, keep it scrolled to bottom.
        if (this.logElement) {
            const nearBottom = (this.logElement.scrollHeight - (this.logElement.scrollTop + this.logElement.clientHeight) <= 40);
            if (nearBottom) this.logElement.scrollTop = this.logElement.scrollHeight;
        }
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    window.commandHistory = new CommandHistory();
});
