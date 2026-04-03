/**
 * Robot Control Module
 * Handles directional buttons, numeric inputs, and command execution
 */

class RobotController {
    constructor() {
        this.lastCommand = null;
        this.isExecuting = false;
        this.commandQueue = [];
        this.isPlayingQueue = false;
        this.initializeElements();
        this.attachEventListeners();
        this.checkConnectionStatus();
    }

    initializeElements() {
        // Directional buttons
        this.btnForward = document.getElementById('btnForward');
        this.btnBackward = document.getElementById('btnBackward');
        this.btnLeft = document.getElementById('btnLeft');
        this.btnRight = document.getElementById('btnRight');

        // Numeric inputs
        this.distanceInput = document.getElementById('distance');
        this.angleInput = document.getElementById('angle');
        this.durationInput = document.getElementById('duration');
        this.durationDisplay = document.getElementById('durationDisplay');
        this.powerInput = document.getElementById('power');
        this.powerDisplay = document.getElementById('powerDisplay');

        // Action buttons
        this.btnExecute = document.getElementById('btnExecute');
        this.btnAddQueue = document.getElementById('btnAddQueue');
        this.btnPlayQueue = document.getElementById('btnPlayQueue');
        this.btnClearQueue = document.getElementById('btnClearQueue');
        this.btnStop = document.getElementById('btnStop');
        this.btnStatus = document.getElementById('btnStatus');

        // Status elements (telemetry)
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.lastPktCounter = document.getElementById('lastPktCounter');
        this.currentGrade = document.getElementById('currentGrade');
        this.hitCount = document.getElementById('hitCount');
        this.heading = document.getElementById('heading');
        this.lastCommandElem = document.getElementById('lastCommand');
        this.lastCommandValue = document.getElementById('lastCommandValue');
        this.lastCommandPower = document.getElementById('lastCommandPower');
        this.lastUpdate = document.getElementById('lastUpdate');

        // Comm console elements
        this.commConsole = document.getElementById('commConsole');
        this.btnClearConsole = document.getElementById('btnClearConsole');
        this.autoScroll = document.getElementById('autoScroll');

        // Queue display
        this.commandQueueList = document.getElementById('commandQueueList');
        
        // Telemetry/Status bar elements
        this.btnTelemetry = document.getElementById('btnTelemetry');
        this.telemetryPanel = document.getElementById('telemetryPanel');
        this.statusBar = document.getElementById('statusBar');
        // Comm Console panel toggle
        this.btnConsole = document.getElementById('btnConsole');
        this.consolePanel = document.getElementById('consolePanel');
    }

    attachEventListeners() {
        // Directional button listeners
        this.btnForward.addEventListener('click', () => this.executeMove('forward'));
        this.btnBackward.addEventListener('click', () => this.executeMove('backward'));
        this.btnLeft.addEventListener('click', () => this.executeTurn('left'));
        this.btnRight.addEventListener('click', () => this.executeTurn('right'));

        // Numeric execute
        this.btnExecute.addEventListener('click', () => this.executeWithParameters());

        // Stop button
        this.btnStop.addEventListener('click', () => this.executeStop());

        // Status button
        this.btnStatus.addEventListener('click', () => this.requestStatus());

        // Slider listeners for display updates
        this.durationInput.addEventListener('input', () => {
            this.durationDisplay.textContent = this.durationInput.value + 's';
        });

        this.powerInput.addEventListener('input', () => {
            this.powerDisplay.textContent = this.powerInput.value + '%';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Console controls
        if (this.btnClearConsole) this.btnClearConsole.addEventListener('click', () => this.clearConsole());
        if (this.autoScroll) this.autoScroll.addEventListener('change', () => {});

        // Queue controls (if present)
        if (this.btnAddQueue) this.btnAddQueue.addEventListener('click', () => this.addCurrentToQueue());
        if (this.btnPlayQueue) this.btnPlayQueue.addEventListener('click', () => this.playQueue());
        if (this.btnClearQueue) this.btnClearQueue.addEventListener('click', () => this.clearQueue());

        // Telemetry toggle
        if (this.btnTelemetry && this.telemetryPanel) {
            this.btnTelemetry.addEventListener('click', () => {
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
    }

    /**
     * Execute forward/backward movement
     */
    async executeMove(direction) {
        const duration = this.parseNumber(this.durationInput.value, 2);
        const power = this.parseNumber(this.powerInput.value, 50);
        const command = {
            type: 'MOVE',
            direction: direction,
            duration: duration,
            power: power,
            timestamp: new Date()
        };

        await this.sendCommand(command);
    }

    /**
     * Execute left/right turn
     */
    async executeTurn(direction) {
        const angle = this.parseNumber(this.angleInput.value, 45);
        const duration = this.parseNumber(this.durationInput.value, 2);
        const power = this.parseNumber(this.powerInput.value, 50);
        const command = {
            type: 'TURN',
            direction: direction,
            angle: angle,
            duration: duration,
            power: power,
            timestamp: new Date()
        };

        await this.sendCommand(command);
    }

    /**
     * Execute command with parameters from input fields
     */
    async executeWithParameters() {
        const distance = this.parseNumber(this.distanceInput.value, 1);
        const angle = this.parseNumber(this.angleInput.value, 45);
        const duration = this.parseNumber(this.durationInput.value, 2);
        const power = this.parseNumber(this.powerInput.value, 50);

        const command = {
            type: 'MOVE',
            direction: 'forward',
            distance: distance,
            duration: duration,
            power: power,
            angle: angle,
            timestamp: new Date()
        };

        await this.sendCommand(command);
    }

    /**
     * Execute stop command
     */
    async executeStop() {
        const command = {
            type: 'STOP',
            timestamp: new Date()
        };

        await this.sendCommand(command);
    }

    /* Queue helpers */
    addCurrentToQueue() {
        const cmd = {
            type: 'MOVE',
            direction: 'forward',
            distance: this.parseNumber(this.distanceInput.value, 1),
            duration: this.parseNumber(this.durationInput.value, 2),
            power: this.parseNumber(this.powerInput.value, 50),
            timestamp: new Date()
        };
        this.commandQueue.push(cmd);
        this.updateQueueDisplay();
        this.appendConsole(`Queued: ${JSON.stringify(cmd)}`);
    }

    async playQueue() {
        if (this.isPlayingQueue) return;
        this.isPlayingQueue = true;
        this.appendConsole(`Play queue (${this.commandQueue.length} commands)`);
        while (this.commandQueue.length > 0) {
            const cmd = this.commandQueue.shift();
            this.updateQueueDisplay();
            await this.sendCommand(cmd);
            // small delay between commands
            await new Promise(r => setTimeout(r, 50));
        }
        this.isPlayingQueue = false;
        this.appendConsole('Queue finished');
    }

    clearQueue() {
        this.commandQueue = [];
        this.updateQueueDisplay();
        this.appendConsole('Queue cleared');
    }

    updateQueueDisplay() {
        if (!this.commandQueueList) return;
        this.commandQueueList.innerHTML = '';
        if (this.commandQueue.length === 0) {
            const p = document.createElement('p');
            p.className = 'log-empty';
            p.textContent = 'Queue is empty';
            this.commandQueueList.appendChild(p);
            return;
        }
        this.commandQueue.forEach((c, idx) => {
            const div = document.createElement('div');
            div.className = 'queue-item';
            div.textContent = `${idx+1}. ${c.type} ${c.direction || ''} dur:${c.duration} pow:${c.power}`;
            this.commandQueueList.appendChild(div);
        });
    }

    /**
     * Request robot status update
     */
    async requestStatus() {
        // indicate request started (visual spinner + disabled)
        if (this.btnStatus) {
            this.btnStatus.disabled = true;
            this.btnStatus.classList.add('loading');
            this.btnStatus.setAttribute('aria-busy', 'true');
        }
        this.appendConsole('GET /robot/telemetry_request -> sending...');
        try {
            const response = await fetch('/robot/telemetry_request', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const body = await response.json();
                const telemetry = body.telemetry || {};
                this.updateStatusDisplay(telemetry);
                this.appendConsole(`GET /robot/telemetry_request -> ${JSON.stringify(body)}`);

                // Log in command history
                window.commandHistory?.addEntry({
                    type: 'STATUS_REQUEST',
                    timestamp: new Date(),
                    response: body,
                    success: true
                });
            } else {
                console.error('Status request failed:', response.status);
                window.commandHistory?.addEntry({
                    type: 'STATUS_REQUEST',
                    timestamp: new Date(),
                    response: 'Failed',
                    success: false
                });
            }
        } catch (error) {
            console.error('Status request error:', error);
            this.appendConsole(`ERROR GET /robot/telemetry_request -> ${error.message}`);
            this.setConnectionStatus(false);
            window.commandHistory?.addEntry({
                type: 'STATUS_REQUEST',
                timestamp: new Date(),
                response: error.message,
                success: false
            });
        } finally {
            if (this.btnStatus) {
                this.btnStatus.disabled = false;
                this.btnStatus.classList.remove('loading');
                this.btnStatus.removeAttribute('aria-busy');
            }
        }
    }

    /**
     * Send command to robot backend
     */
    async sendCommand(command) {
        if (this.isExecuting) {
            console.log('Command already executing');
            return;
        }

        this.isExecuting = true;
        this.btnExecute.disabled = true;
        this.btnForward.disabled = true;
        this.btnBackward.disabled = true;
        this.btnLeft.disabled = true;
        this.btnRight.disabled = true;

        try {
            const endpoint = command.type === 'MOVE' ? '/robot/move' : 
                           command.type === 'TURN' ? '/robot/turn' :
                           command.type === 'STOP' ? '/robot/stop' : '/robot/command';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(command)
            });

            const responseData = await response.json();
            this.appendConsole(`POST ${endpoint} -> request: ${JSON.stringify(command)} response: ${JSON.stringify(responseData)}`);

            // If the backend echoes built packet bytes as an array under `raw_packet`, show hex dump
            if (responseData && responseData.raw_packet) {
                this.showRawPacket(responseData.raw_packet);
            }
            if (response.ok) {
                // Log successful command
                window.commandHistory?.addEntry({
                    type: command.type,
                    command: command,
                    response: responseData,
                    success: true,
                    timestamp: new Date()
                });
                this.setConnectionStatus(true);
            } else {
                // Log failed command
                window.commandHistory?.addEntry({
                    type: command.type,
                    command: command,
                    response: responseData,
                    success: false,
                    timestamp: new Date()
                });
                this.setConnectionStatus(false);
            }

            this.lastCommand = command;
        } catch (error) {
            console.error('Command execution error:', error);
            this.appendConsole(`ERROR sending command ${JSON.stringify(command)} -> ${error.message}`);
            window.commandHistory?.addEntry({
                type: command.type,
                command: command,
                response: error.message,
                success: false,
                timestamp: new Date()
            });
            this.setConnectionStatus(false);
        } finally {
            this.isExecuting = false;
            this.btnExecute.disabled = false;
            this.btnForward.disabled = false;
            this.btnBackward.disabled = false;
            this.btnLeft.disabled = false;
            this.btnRight.disabled = false;
        }
    }

    /**
     * Handle keyboard shortcuts
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
            } else if (event.key === ' ') {
                event.preventDefault();
                this.btnStop.click();
            }
        }
    }

    /**
     * Update status display with telemetry data
     */
    updateStatusDisplay(status) {
        if (!status) return;

        // keep legacy fields updated for compatibility (guard DOM elements)
        if (status.last_packet_counter !== undefined && this.lastPktCounter) this.lastPktCounter.textContent = status.last_packet_counter;
        if (status.current_grade !== undefined && this.currentGrade) this.currentGrade.textContent = status.current_grade;
        if (status.hit_count !== undefined && this.hitCount) this.hitCount.textContent = status.hit_count;
        if (status.heading !== undefined && this.heading) this.heading.textContent = status.heading;
        if (status.last_command !== undefined && this.lastCommandElem) this.lastCommandElem.textContent = status.last_command;
        if (status.last_command_value !== undefined && this.lastCommandValue) this.lastCommandValue.textContent = status.last_command_value;
        if (status.last_command_power !== undefined && this.lastCommandPower) this.lastCommandPower.textContent = status.last_command_power;
        if (this.lastUpdate) this.lastUpdate.textContent = new Date().toLocaleTimeString();

        // render cards in telemetry status bar
        if (this.statusBar) {
            // helper to add/update card
            const set = (key, label, value, unit, state) => this.createOrUpdateCard(key, label, value, unit, state);

            set('connection', 'Connection', this.statusText ? this.statusText.textContent : (status.connected ? 'Connected' : 'Disconnected'), '');
            if (status.last_packet_counter !== undefined) set('pkt', 'Packet #', status.last_packet_counter, '');
            if (status.current_grade !== undefined) set('grade', 'Grade', status.current_grade, '');
            if (status.hit_count !== undefined) set('hits', 'Hits', status.hit_count, '');
            if (status.heading !== undefined) set('heading', 'Heading', status.heading, '°');
            if (status.last_command !== undefined) set('lastcmd', 'Last Cmd', status.last_command, '');
            if (status.last_command_value !== undefined) set('lastval', 'Cmd Val', status.last_command_value, '');
            if (status.last_command_power !== undefined) set('lastpow', 'Power', status.last_command_power, '%');
        }
    }

    /** Create or update a status card in the telemetry bar */
    createOrUpdateCard(key, label, value, unit, state) {
        if (!this.statusBar) return;
        // remove placeholder message if present (first real card)
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

        // state classes
        card.classList.remove('warning', 'alert', 'ok');
        if (state === 'warning') card.classList.add('warning');
        else if (state === 'alert') card.classList.add('alert');
        else if (state === 'ok') card.classList.add('ok');
    }

    /**
     * Update connection status indicator
     */
    setConnectionStatus(connected) {
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

    /**
     * Append a line to the communication console.
     */
    appendConsole(msg) {
        if (!this.commConsole) return;
        const line = document.createElement('div');
        line.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg);
        this.commConsole.appendChild(line);
        if (this.autoScroll && this.autoScroll.checked) {
            this.commConsole.scrollTop = this.commConsole.scrollHeight;
        }
    }

    /**
     * Clear the console contents.
     */
    clearConsole() {
        if (!this.commConsole) return;
        this.commConsole.innerHTML = '';
    }

    /**
     * Show raw packet data (Uint8Array or array of numbers) in hex format.
     */
    showRawPacket(bytes) {
        if (!bytes) return;
        let arr;
        if (bytes instanceof Uint8Array) arr = Array.from(bytes);
        else if (Array.isArray(bytes)) arr = bytes;
        else return this.appendConsole(String(bytes));

        const hex = arr.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join(' ');
        this.appendConsole(`RAW: ${hex}`);
    }

    /**
     * Parse numbers safely: preserve explicit 0, fall back for empty/invalid input
     */
    parseNumber(value, fallback) {
        if (value === null || value === undefined) return fallback;
        // treat empty string as invalid
        if (typeof value === 'string' && value.trim() === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * Check initial connection status
     */
    async checkConnectionStatus() {
        try {
            const response = await fetch('/robot/status', {
                method: 'GET'
            });
            this.setConnectionStatus(response.ok);
        } catch (error) {
            this.setConnectionStatus(false);
        }
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    window.robotController = new RobotController();
});
