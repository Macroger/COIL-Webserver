/**
 * Robot Control Module
 * Handles directional buttons, numeric inputs, and command execution
 */

class RobotController {
    constructor() {
        this.lastCommand = null;
        this.isExecuting = false;
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
        this.btnStop = document.getElementById('btnStop');
        this.btnStatus = document.getElementById('btnStatus');

        // Status elements (telemetry)
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.lastPktCounter = document.getElementById('lastPktCounter');
        this.currentGrade = document.getElementById('currentGrade');
        this.hitCount = document.getElementById('hitCount');
        this.heading = document.getElementById('heading');
        this.lastCommand = document.getElementById('lastCommand');
        this.lastCommandValue = document.getElementById('lastCommandValue');
        this.lastCommandPower = document.getElementById('lastCommandPower');
        this.lastUpdate = document.getElementById('lastUpdate');
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
    }

    /**
     * Execute forward/backward movement
     */
    async executeMove(direction) {
        const distance = parseFloat(this.distanceInput.value) || 1;
        const duration = parseFloat(this.durationInput.value) || 2;
        const power = parseInt(this.powerInput.value) || 50;
        const command = {
            type: 'MOVE',
            direction: direction,
            distance: distance,
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
        const angle = parseFloat(this.angleInput.value) || 45;
        const duration = parseFloat(this.durationInput.value) || 2;
        const power = parseInt(this.powerInput.value) || 50;
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
        const distance = parseFloat(this.distanceInput.value) || 1;
        const angle = parseFloat(this.angleInput.value) || 45;
        const duration = parseFloat(this.durationInput.value) || 2;
        const power = parseInt(this.powerInput.value) || 50;

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

    /**
     * Request robot status update
     */
    async requestStatus() {
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
            this.setConnectionStatus(false);
            window.commandHistory?.addEntry({
                type: 'STATUS_REQUEST',
                timestamp: new Date(),
                response: error.message,
                success: false
            });
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
        if (status.last_packet_counter !== undefined) this.lastPktCounter.textContent = status.last_packet_counter;
        if (status.current_grade !== undefined) this.currentGrade.textContent = status.current_grade;
        if (status.hit_count !== undefined) this.hitCount.textContent = status.hit_count;
        if (status.heading !== undefined) this.heading.textContent = status.heading;
        if (status.last_command !== undefined) this.lastCommand.textContent = status.last_command;
        if (status.last_command_value !== undefined) this.lastCommandValue.textContent = status.last_command_value;
        if (status.last_command_power !== undefined) this.lastCommandPower.textContent = status.last_command_power;
        this.lastUpdate.textContent = new Date().toLocaleTimeString();
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
