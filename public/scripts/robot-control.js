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
        this.updatePendingDisplay();
        // Ensure slider readouts are correct on load
        if (this.durationInput && this.durationDisplay) {
            this.durationDisplay.textContent = this.durationInput.value + 's';
        }
        if (this.powerInput && this.powerDisplay) {
            if (Number(this.powerInput.value) < 80) this.powerInput.value = 80;
            this.powerDisplay.textContent = this.powerInput.value + '%';
        }
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
        this.statusBar = document.getElementById('statusBar');
        // Telemetry card elements
        this.lastPktCounter = document.getElementById('telemetryLastPktCounter');
        this.currentGrade = document.getElementById('telemetryCurrentGrade');
        this.hitCount = document.getElementById('telemetryHitCount');
        this.heading = document.getElementById('telemetryHeading');
        this.lastCommandElem = document.getElementById('telemetryLastCmd');
        this.lastCommandValue = document.getElementById('telemetryLastCmdValue');
        this.lastCommandPower = document.getElementById('telemetryLastCmdPower');

        // Comm console
        this.commConsole = document.getElementById('commConsole');
        this.btnClearConsole = document.getElementById('btnClearConsole');
        this.btnDownloadConsole = document.getElementById('btnDownloadConsole');
        this.autoScroll = document.getElementById('autoScroll');

        // Sleep button
        this.btnSleep = document.getElementById('btnSleep');

        // Console & telemetry toggles
        this.btnTelemetry = document.getElementById('btnTelemetry');
        this.telemetryPanel = document.getElementById('telemetryPanel');
        this.btnConsole = document.getElementById('btnConsole');
        this.consolePanel = document.getElementById('consolePanel');
        this.btnStatus = document.getElementById('btnStatus');
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
        if (this.btnDownloadConsole) this.btnDownloadConsole.addEventListener('click', () => this.downloadConsole());

        // Telemetry button — request telemetry directly
        if (this.btnTelemetry && this.telemetryPanel) 
        {
            this.btnTelemetry.addEventListener('click', () => 
            {
                this.telemetryPanel.classList.toggle('visible');
                this.telemetryPanel.classList.toggle('hidden');
                const expanded = this.telemetryPanel.classList.contains('visible');
                this.btnTelemetry.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            });
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

        // Sleep button
        if (this.btnSleep) this.btnSleep.addEventListener('click', () => this.sendSleep());
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
                this.appendConsole(`Queued one command: ${cmd.type} ${cmd.direction || ''}`, 'info');
                this.updatePendingDisplay();
            } else {
                this.appendConsole('Already have one queued command; ignoring additional presses.', 'info');
            }
        }
    }

    async _executeAndBlock(cmd) {
        this.isExecuting = true;
        this.pendingCommand = this.pendingCommand || null; // keep existing pending slot
        this.updatePendingDisplay();
        this.disableControlsForCommand(cmd);
        const cmdLabel = cmd.type === 'TURN'
            ? `TURN ${(cmd.direction || '').toUpperCase()} — duration: ${cmd.duration}s`
            : `MOVE ${(cmd.direction || '').toUpperCase()} — duration: ${cmd.duration}s, power: ${cmd.power}%`;
        this.appendConsole(`DRIVE pkt -> ${cmdLabel}`, 'send');

        // Determine endpoint
        const endpoint = '/robot/telecommand';

        // Map frontend cmd shape to the server's expected field names:
        // - server expects "command": "DRIVE", "direction": uppercase, "duration", "power"
        const payload = {
            command: 'DRIVE',
            direction: (cmd.direction || 'forward').toUpperCase(),
            duration: cmd.duration,
            power: cmd.power
        };

        try {
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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
                const simResponse = responseData?.sim_response || 'UNKNOWN';
                const pktNum = responseData?.packet_count ?? '?';
                this.appendConsole(`DRIVE pkt #${pktNum} -> ${simResponse}`, 'recv');
            } else {
                this.appendConsole(`DRIVE pkt -> ERR ${responseData ? JSON.stringify(responseData) : (responseText || response.statusText || response.status)}`, 'recv');
            }

            const ack = response.ok && (responseData?.ack === true);
            window.commandHistory?.addEntry({
                type: cmd.type,
                command: cmd,
                success: ack,
                timestamp: new Date()
            });

            this.setConnectionStatus(response.ok);
        } catch (error) {
            this.appendConsole(error, 'info');
            window.commandHistory?.addEntry({ type: cmd.type, command: cmd, response: (error && (error.stack || error.message)) || String(error), success: false, timestamp: new Date() });
            this.setConnectionStatus(false);
        }

        // Keep UI disabled for duration + 250ms as requested
        const waitMs = Math.round((cmd.duration || 0) * 1000) + 250;
        // Show countdown in processing message
        if (this.processingMessage) {
            let remaining = waitMs;
            this.processingMessage.textContent = `Please wait, processing command (${cmd.type})... (${(remaining/1000).toFixed(1)}s)`;
            let interval = setInterval(() => {
                remaining -= 100;
                if (remaining > 0) {
                    this.processingMessage.textContent = `Please wait, processing command (${cmd.type})... (${(remaining/1000).toFixed(1)}s)`;
                } else {
                    clearInterval(interval);
                }
            }, 100);
        }
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
        if (this.btnStatus) {
            this.btnStatus.disabled = true;
            this.btnStatus.classList.add('loading');
            this.btnStatus.setAttribute('aria-busy', 'true');
        }
        this.appendConsole('TELEMETRY REQUEST pkt -> requesting robot state', 'send');
        try {
            const response = await fetch('/robot/telemetry_request', { method: 'GET' });
            if (response.ok) 
            {
                const body = await response.json().catch(() => null);
                const t = body?.telemetry;
                const pktNum = t?.last_packet_counter ?? '?';
                const lastCmd = t?.last_command
                    ? `${t.last_command} (val: ${t?.last_command_value ?? '—'}, pwr: ${t?.last_command_power ?? '—'}%)`
                    : '—';
                const summary = [
                    `heading: ${t?.heading ?? '—'}°`,
                    `grade: ${t?.current_grade ?? '—'}`,
                    `hits: ${t?.hit_count ?? '—'}`,
                    `last cmd: ${lastCmd}`
                ].join('  |  ');
                this.appendConsole(`TELEMETRY pkt #${pktNum} -> ${summary}`, 'recv');
                this.updateStatusDisplay(body?.telemetry);
                this.setConnectionStatus(true);
                window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', success: true });
            } 
            else 
            {
                let respBody = null;
                try {
                    const ct = response.headers.get('content-type') || '';
                    if (ct.includes('application/json')) respBody = await response.json();
                    else respBody = await response.text();
                } catch (e) {
                    respBody = `(<failed to read body> ${e && e.message ? e.message : String(e)})`;
                }
                this.appendConsole(`Status request failed: ${typeof respBody === 'string' ? respBody : JSON.stringify(respBody)}`, 'recv');
                this.setConnectionStatus(false);
                window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', success: false });
            }
        } catch (error) {
            this.appendConsole(error, 'info');
            this.setConnectionStatus(false);
            window.commandHistory?.addEntry({ type: 'STATUS_REQUEST', success: false });
        } finally {
            if (this.btnStatus) {
                this.btnStatus.disabled = false;
                this.btnStatus.classList.remove('loading');
                this.btnStatus.removeAttribute('aria-busy');
            }
        }
    }

    resetStatusDisplay() {
        const dash = '—';
        if (this.lastPktCounter)    this.lastPktCounter.textContent    = dash;
        if (this.currentGrade)      this.currentGrade.textContent      = dash;
        if (this.hitCount)          this.hitCount.textContent          = dash;
        if (this.heading)           this.heading.textContent           = dash;
        if (this.lastCommandElem)   this.lastCommandElem.textContent   = dash;
        if (this.lastCommandValue)  this.lastCommandValue.textContent  = dash;
        if (this.lastCommandPower)  this.lastCommandPower.textContent  = dash;
        if (this.lastUpdate)        this.lastUpdate.textContent        = dash;
    }

    updateStatusDisplay(status) {
        if (status.last_packet_counter !== undefined && this.lastPktCounter) this.lastPktCounter.textContent = status.last_packet_counter;
        if (status.current_grade !== undefined && this.currentGrade) this.currentGrade.textContent = status.current_grade;
        if (status.hit_count !== undefined && this.hitCount) this.hitCount.textContent = status.hit_count;
        if (status.heading !== undefined && this.heading) this.heading.textContent = status.heading;
        if (status.last_command !== undefined && this.lastCommandElem) this.lastCommandElem.textContent = status.last_command;
        if (status.last_command_value !== undefined && this.lastCommandValue) this.lastCommandValue.textContent = status.last_command_value;
        if (status.last_command_power !== undefined && this.lastCommandPower) this.lastCommandPower.textContent = status.last_command_power;
        if (this.lastUpdate) this.lastUpdate.textContent = new Date().toLocaleTimeString();

        // if (this.statusBar) {
        //     const set = (key, label, value, unit, state) => this.createOrUpdateCard(key, label, value, unit, state);
        //     set('connection', 'Connection', this.statusText ? this.statusText.textContent : (status.connected ? 'Connected' : 'Disconnected'), '');
        //     if (status.last_packet_counter !== undefined) set('pkt', 'Packet #', status.last_packet_counter, '');
        //     if (status.current_grade !== undefined) set('grade', 'Grade', status.current_grade, '');
        //     if (status.hit_count !== undefined) set('hits', 'Hits', status.hit_count, '');
        //     if (status.heading !== undefined) set('heading', 'Heading', status.heading, '°');
        //     if (status.last_command !== undefined) set('lastcmd', 'Last Cmd', status.last_command, '');
        //     if (status.last_command_value !== undefined) set('lastval', 'Cmd Val', status.last_command_value, '');
        //     if (status.last_command_power !== undefined) set('lastpow', 'Power', status.last_command_power, '%');
        // }
    }

    createOrUpdateCard(key, label, value, unit, state) {
        if (!this.statusBar) return;
        const placeholder = this.statusBar.querySelector('.log-empty');
        if (placeholder) placeholder.remove();
        const id = `status-card-${key}`;
        let card = document.getElementById(id);
        if (!card) {
            card = document.createElement('div');
            card.id = id;
            card.className = 'status-card';
            card.innerHTML = `<div class="card-label"></div><div class="card-value"></div>`;
            this.statusBar.appendChild(card);
        }
        const labelEl = card.querySelector('.card-label');
        const valueEl = card.querySelector('.card-value');
        if (labelEl) labelEl.textContent = label;
        if (valueEl) valueEl.textContent = (value === null || value === undefined) ? '--' : `${value}${unit || ''}`;
        card.classList.remove('warning', 'alert', 'ok');
        if (state === 'warning') card.classList.add('warning');
        else if (state === 'alert') card.classList.add('alert');
        else if (state === 'ok') card.classList.add('ok');
    }

    setConnectionStatus(connected) {
        if (connected && window.connectionConfig) {
            window.connectionConfig.onTelemetryReceived();
        }
        if (this.statusIndicator && this.statusText) {
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
        // Mirror into Connection status card
        const connCard = document.getElementById('statusCardConnection');
        if (connCard) { const v = connCard.querySelector('.value'); if (v) v.textContent = connected ? 'Connected' : 'Disconnected'; }
    }

    appendConsole(msg, direction = 'info') {
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
        const badge = document.createElement('span');
        badge.className = `console-tag console-tag--${direction}`;
        badge.textContent = direction === 'send' ? 'SEND' : direction === 'recv' ? 'RECV' : 'INFO';
        pre.appendChild(badge);
        pre.appendChild(document.createTextNode(' ' + text));
        this.commConsole.appendChild(pre);
        if (this.autoScroll && this.autoScroll.checked) {
            this.commConsole.scrollTop = this.commConsole.scrollHeight;
        }
    }

    clearConsole() {
        if (!this.commConsole) return;
        this.commConsole.innerHTML = '';
    }

    downloadConsole() {
        if (!this.commConsole) return;
        const lines = [...this.commConsole.querySelectorAll('.console-line')]
            .map(el => el.textContent)
            .join('\n');
        const blob = new Blob([lines], { type: 'text/plain' });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: `console-${Date.now()}.txt`
        });
        a.click();
        URL.revokeObjectURL(a.href);
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

    async sendSleep() {
        if (this.btnSleep) {
            this.btnSleep.disabled = true;
        }
        this.appendConsole('PUT /robot/telecommand (SLEEP) -> sending...', 'send');
        try {
            const response = await fetch('/robot/telecommand', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'SLEEP' })
            });

            let responseData = null;
            try {
                const ct = response.headers.get('content-type') || '';
                if (ct.includes('application/json')) responseData = await response.json();
            } catch (_) {}

            if (response.ok) {
                const pktNum = responseData?.packet_count ?? '?';
                const simResponse = responseData?.sim_response || 'UNKNOWN';
                this.appendConsole(`PUT /robot/telecommand (SLEEP) -> ${simResponse} (pkt #${pktNum})`, 'recv');
                this.resetStatusDisplay();
                if (window.connectionConfig) {
                    window.connectionConfig.sleepSent = true;
                    if (window.connectionConfig.currentMode === ConnectionType.TCP) {
                        // TCP: server still has an open socket — close it cleanly.
                        this.appendConsole('Robot sleeping — closing TCP connection...', 'info');
                        window.connectionConfig.disconnect();
                    } else {
                        // UDP: no persistent connection to close — just mark disconnected locally.
                        window.connectionConfig.isConnected = false;
                        window.connectionConfig.lastHeartbeat = null;
                        if (window.connectionConfig.udpHeartbeatTimeout) {
                            clearTimeout(window.connectionConfig.udpHeartbeatTimeout);
                            window.connectionConfig.udpHeartbeatTimeout = null;
                        }
                        window.connectionConfig.updateConnectionDisplay();
                        this.appendConsole('Robot sleeping — UDP connection marked closed', 'info');
                    }
                }
            } else {
                this.appendConsole(`PUT /robot/telecommand (SLEEP) -> ERR ${responseData ? JSON.stringify(responseData) : response.status}`, 'recv');
            }

            window.commandHistory?.addEntry({
                type: 'SLEEP',
                success: response.ok,
                timestamp: new Date(),
                response: responseData?.sim_response || 'UNKNOWN'
            });
        } catch (error) {
            this.appendConsole(`SLEEP command error: ${error && error.message ? error.message : String(error)}`, 'info');
        } finally {
            if (this.btnSleep) {
                setTimeout(() => {
                    if (this.btnSleep) this.btnSleep.disabled = false;
                }, 1000);
            }
        }
    }

}


window.addEventListener('load', () => {
    window.robotController = new RobotController();
});
