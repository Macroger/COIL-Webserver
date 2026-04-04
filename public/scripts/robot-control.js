/**
 * Robot Control Module
 * Simplified: four direction buttons + duration + power slider
 * Enforces power 80-100%, single-command execution with optional one-slot queue
 */

class RobotController {
    constructor() {
        this.lastCommand = null;
        this.isExecuting = false;
        this.pendingCommand = null; // single-slot queued command
        this.initializeElements();
        this.attachEventListeners();
        this.checkConnectionStatus();
        this.updatePendingDisplay();
    }

    initializeElements() {
        // Directional buttons
        this.btnForward = document.getElementById('btnForward');
        this.btnBackward = document.getElementById('btnBackward');
        this.btnLeft = document.getElementById('btnLeft');
        this.btnRight = document.getElementById('btnRight');
        this.arrowPad = document.querySelector('.arrow-pad');
        // Numeric inputs
        this.durationInput = document.getElementById('duration');
        this.durationDisplay = document.getElementById('durationDisplay');
        this.powerInput = document.getElementById('power');
        this.powerDisplay = document.getElementById('powerDisplay');

        // Pending command display (single-slot)
        this.commandQueueList = document.getElementById('commandQueueList');

        // Processing message
        this.processingMessage = document.getElementById('processingMessage');

        // Status / telemetry
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');

        // Comm console
        this.commConsole = document.getElementById('commConsole');
        this.btnClearConsole = document.getElementById('btnClearConsole');
        this.autoScroll = document.getElementById('autoScroll');

        // Console & telemetry toggles
        this.btnTelemetry = document.getElementById('btnTelemetry');
        this.telemetryPanel = document.getElementById('telemetryPanel');
        this.btnConsole = document.getElementById('btnConsole');
        this.consolePanel = document.getElementById('consolePanel');
    }

    attachEventListeners() {
        // Directional buttons
        this.btnForward.addEventListener('click', () => this.handleDirection('forward'));
        this.btnBackward.addEventListener('click', () => this.handleDirection('backward'));
        this.btnLeft.addEventListener('click', () => this.handleDirection('left'));
        this.btnRight.addEventListener('click', () => this.handleDirection('right'));

        // Slider display updates
        this.durationInput.addEventListener('input', () => {
            this.durationDisplay.textContent = this.durationInput.value + 's';
        });
        this.powerInput.addEventListener('input', () => {
            // enforce min bound (in case of programmatic changes)
            if (Number(this.powerInput.value) < 80) this.powerInput.value = 80;
            this.powerDisplay.textContent = this.powerInput.value + '%';
        });

        // Keyboard arrows
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Console controls
        if (this.btnClearConsole) this.btnClearConsole.addEventListener('click', () => this.clearConsole());

        // Telemetry button — request telemetry directly
        if (this.btnTelemetry) {
            this.btnTelemetry.addEventListener('click', () => this.requestStatus());
        }

        // Console toggle
        if (this.btnConsole && this.consolePanel) {
            this.btnConsole.addEventListener('click', () => {
                this.consolePanel.classList.toggle('visible');
                this.consolePanel.classList.toggle('hidden');
                const expanded = this.consolePanel.classList.contains('visible');
                this.btnConsole.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            });
        }

        // Status button
        if (this.btnStatus) this.btnStatus.addEventListener('click', () => this.requestStatus());
    }

    /* --- Input handlers --- */
    handleDirection(direction) {
        const duration = this.parseNumber(this.durationInput.value, 5);
        const power = this.parseNumber(this.powerInput.value, 80);
        const cmd = {
            type: direction === 'left' || direction === 'right' ? 'TURN' : 'MOVE',
            direction: direction,
            duration: duration,
            power: Math.max(80, Math.min(100, power)),
            timestamp: new Date(),
        };
        this.sendOrQueue(cmd);
    }

    /* Single-slot queue logic */
    sendOrQueue(cmd) {
        if (!this.isExecuting) {
            this._executeAndBlock(cmd);
        } else {
            if (!this.pendingCommand) {
                this.pendingCommand = cmd;
                this.appendConsole(`Queued one command: ${cmd.type} ${cmd.direction || ''}`);
                this.updatePendingDisplay();
            } else {
                this.appendConsole('Already have one queued command; ignoring additional presses.');
            }
        }
    }

    async _executeAndBlock(cmd) {
        this.isExecuting = true;
        this.pendingCommand = this.pendingCommand || null; // keep existing pending slot
        this.updatePendingDisplay();
        this.disableControlsForCommand(cmd);
        this.appendConsole(`Sending command: ${JSON.stringify(cmd)}`);

        // Determine endpoint
        const endpoint = cmd.type === 'MOVE' ? '/robot/move' : (cmd.type === 'TURN' ? '/robot/turn' : '/robot/command');

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cmd)
            });

            let responseData = null;
            let responseText = null;
            try {
                const ct = response.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseText = await response.text();
                }
            } catch (e) {
                responseText = `(<failed to read body> ${e && e.message ? e.message : String(e)})`;
            }

            if (response.ok) {
                this.appendConsole(`POST ${endpoint} -> OK ${responseData ? JSON.stringify(responseData) : (responseText || response.statusText || response.status)}`);
            } else {
                this.appendConsole(`POST ${endpoint} -> ERR ${responseData ? JSON.stringify(responseData) : (responseText || response.statusText || response.status)}`);
            }

            if (responseData && responseData.raw_packet) {
                this.showRawPacket(responseData.raw_packet);
            } else if (responseText) {
                try {
                    const parsed = JSON.parse(responseText);
                    if (parsed && parsed.raw_packet) this.showRawPacket(parsed.raw_packet);
                } catch (e) { /* ignore parse errors */ }
            }

            window.commandHistory?.addEntry({
                type: cmd.type,
                command: cmd,
                response: responseData || responseText || (response.statusText || response.status),
                success: response.ok,
                timestamp: new Date()
            });

            this.setConnectionStatus(response.ok);
        } catch (error) {
            this.appendConsole(error);
            window.commandHistory?.addEntry({ type: cmd.type, command: cmd, response: (error && (error.stack || error.message)) || String(error), success: false, timestamp: new Date() });
            this.setConnectionStatus(false);
        }

        // Keep UI disabled for duration + 250ms as requested
        const waitMs = Math.round((cmd.duration || 0) * 1000) + 250;
        this.appendConsole(`Waiting ${waitMs}ms for command completion (UI locked)`);
        await new Promise(r => setTimeout(r, waitMs));

        // After wait, check pending slot
        this.isExecuting = false;
        if (this.pendingCommand) {
            const next = this.pendingCommand;
            this.pendingCommand = null;
            this.updatePendingDisplay();
            // small gap before executing next queued command
            await new Promise(r => setTimeout(r, 50));
            return this._executeAndBlock(next);
        }

        this.enableControls();
    }

    disableControlsForCommand(cmd) {
        // visually mark buttons and disable them
        [this.btnForward, this.btnBackward, this.btnLeft, this.btnRight].forEach(b => {
            b.disabled = true;
            b.classList.add('processing');
        });
        if (this.arrowPad) this.arrowPad.classList.add('processing');
        if (this.processingMessage) {
            this.processingMessage.textContent = `Please wait, processing command (${cmd.type})...`;
            this.processingMessage.classList.remove('hidden');
            this.processingMessage.classList.add('visible');
            this.processingMessage.setAttribute('aria-busy', 'true');
        }
    }

    enableControls() {
        [this.btnForward, this.btnBackward, this.btnLeft, this.btnRight].forEach(b => {
            b.disabled = false;
            b.classList.remove('processing');
        });
        if (this.arrowPad) this.arrowPad.classList.remove('processing');
        if (this.processingMessage) {
            this.processingMessage.classList.remove('visible');
            this.processingMessage.classList.add('hidden');
            this.processingMessage.removeAttribute('aria-busy');
        }
    }

    updatePendingDisplay() {
        if (!this.commandQueueList) return;
        this.commandQueueList.innerHTML = '';
        if (!this.pendingCommand) {
            const p = document.createElement('p');
            p.className = 'log-empty';
            p.textContent = 'No pending command';
            this.commandQueueList.appendChild(p);
            return;
        }
        const c = this.pendingCommand;
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.textContent = `${c.type} ${c.direction || ''} dur:${c.duration} pow:${c.power}`;
        this.commandQueueList.appendChild(div);
    }

    /**
     * Keyboard handler for arrow keys
     */
    handleKeyboard(event) {
        if (event.target === document.body) {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.btnForward.click();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.btnBackward.click();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                this.btnLeft.click();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                this.btnRight.click();
            }
        }
    }

    /* --- Telemetry & Status --- */
    async requestStatus() {
        if (this.btnTelemetry) {
            this.btnTelemetry.disabled = true;
            this.btnTelemetry.classList.add('loading');
            this.btnTelemetry.setAttribute('aria-busy', 'true');
        }
        this.appendConsole('GET /robot/telemetry_request -> sending...');
        try {
            const response = await fetch('/robot/telemetry_request', { method: 'GET' });
            if (response.ok) {
                const body = await response.json().catch(() => null);
                this.appendConsole(`GET /robot/telemetry_request -> ${JSON.stringify(body)}`);
                window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', timestamp: new Date(), response: body, success: true });
            } else {
                let respBody = null;
                try {
                    const ct = response.headers.get('content-type') || '';
                    if (ct.includes('application/json')) respBody = await response.json();
                    else respBody = await response.text();
                } catch (e) {
                    respBody = `(<failed to read body> ${e && e.message ? e.message : String(e)})`;
                }
                window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', timestamp: new Date(), response: respBody || response.statusText || 'Failed', success: false });
                this.appendConsole(`Status request failed: ${typeof respBody === 'string' ? respBody : JSON.stringify(respBody)}`);
            }
        } catch (error) {
            this.appendConsole(error);
            this.setConnectionStatus(false);
            window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', timestamp: new Date(), response: (error && (error.stack || error.message)) || String(error), success: false });
        } finally {
            if (this.btnTelemetry) {
                this.btnTelemetry.disabled = false;
                this.btnTelemetry.classList.remove('loading');
                this.btnTelemetry.removeAttribute('aria-busy');
            }
        }
    }

    setConnectionStatus(connected) {
        if (!this.statusIndicator || !this.statusText) return;
        if (connected) {
            this.statusIndicator.classList.remove('disconnected');
            this.statusIndicator.classList.add('connected');
            this.statusText.textContent = 'Connected';
        } else {
            this.statusIndicator.classList.remove('connected');
            this.statusIndicator.classList.add('disconnected');
            this.statusText.textContent = 'Disconnected';
        }
    }

    appendConsole(msg) {
        if (!this.commConsole) return;
        const pre = document.createElement('pre');
        pre.className = 'console-line';
        let text;
        if (msg instanceof Error) {
            text = msg.stack || msg.message || String(msg);
        } else if (typeof msg === 'object') {
            try {
                text = JSON.stringify(msg, Object.getOwnPropertyNames(msg), 2);
            } catch (e) {
                try {
                    const keys = Object.getOwnPropertyNames(msg);
                    const simple = {};
                    keys.forEach(k => { try { simple[k] = msg[k]; } catch (_) { simple[k] = '<unreadable>'; } });
                    text = JSON.stringify(simple, null, 2);
                } catch (e2) {
                    text = String(msg);
                }
            }
        } else {
            text = String(msg);
        }
        pre.textContent = text;
        this.commConsole.appendChild(pre);
        if (this.autoScroll && this.autoScroll.checked) {
            this.commConsole.scrollTop = this.commConsole.scrollHeight;
        }
    }

    clearConsole() {
        if (!this.commConsole) return;
        this.commConsole.innerHTML = '';
    }

    showRawPacket(bytes) {
        if (!bytes) return;
        let arr;
        if (bytes instanceof Uint8Array) arr = Array.from(bytes);
        else if (Array.isArray(bytes)) arr = bytes;
        else return this.appendConsole(String(bytes));
        const hex = arr.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join(' ');
        this.appendConsole(`RAW: ${hex}`);
    }

    parseNumber(value, fallback) {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'string' && value.trim() === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    async checkConnectionStatus() {
        try {
            const response = await fetch('/robot/status', { method: 'GET' });
            this.setConnectionStatus(response.ok);
        } catch (error) {
            this.setConnectionStatus(false);
        }
    }
}

window.addEventListener('load', () => {
    window.robotController = new RobotController();
});
