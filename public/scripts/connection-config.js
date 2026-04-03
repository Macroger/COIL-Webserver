/**
 * Connection Configuration Module
 * Handles robot connection settings, IP/Port configuration, and socket type selection
 */

const ConnectionType = Object.freeze({
    TCP: 0,
    UDP: 1
});

class ConnectionConfig {
    constructor() {
        this.isConnected = false;
        this.currentMode = ConnectionType.TCP;
        this.currentIP = 'localhost';
        this.currentPort = 5000;
        this.udpHeartbeatTimeout = null;
        this.lastHeartbeat = null;
        this.initializeElements();
        this.attachEventListeners();
        this.loadSavedConfig();
        this.initializeConnection();
    }

    initializeElements() {
        this.btnSettings = document.getElementById('btnSettings');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.robotIP = document.getElementById('robotIP');
        this.robotPort = document.getElementById('robotPort');
        this.socketType = document.getElementById('socketType');
        this.btnConnect = document.getElementById('btnConnect');
        this.btnDisconnect = document.getElementById('btnDisconnect');
        this.btnReconnect = document.getElementById('btnReconnect');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionMode = document.getElementById('connectionMode');
    }

    attachEventListeners() {
        // Settings panel toggle
        this.btnSettings.addEventListener('click', () => this.toggleSettingsPanel());

        // Connection buttons
        this.btnConnect.addEventListener('click', () => this.connect());
        this.btnDisconnect.addEventListener('click', () => this.disconnect());
        this.btnReconnect.addEventListener('click', () => this.reconnect());

        // Listen for telemetry updates to refresh heartbeat (for UDP)
        window.addEventListener('telemetryReceived', () => this.onTelemetryReceived());
    }

    /**
     * Toggle settings panel visibility
     */
    toggleSettingsPanel() {
        this.settingsPanel.classList.toggle('visible');
        this.settingsPanel.classList.toggle('hidden');
    }

    /**
     * Connect to robot
     */
    async connect() {
        const ip = this.robotIP.value;
        const port = parseInt(this.robotPort.value);
        const mode = parseInt(this.socketType.value);

        if (!ip || !port) {
            alert('Please enter valid IP and Port');
            return;
        }

        try {
            // Log outgoing request
            const outgoingEntry = {
                type: 'OUTGOING',
                timestamp: new Date(),
                request: { ip, port, mode },
                message: '/robot/connect request sent',
                success: null
            };
            window.commandHistory?.addEntry(outgoingEntry);

            const response = await fetch('/robot/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ip: ip,
                    port: port,
                    mode: mode
                })
            });

            const modeLabel = mode === ConnectionType.TCP ? 'TCP' : 'UDP';

            if (response.ok) {
                const data = await response.json();
                this.currentIP = ip;
                this.currentPort = port;
                this.currentMode = mode;
                this.isConnected = true;
                this.lastHeartbeat = new Date();
                this.saveConfig();
                this.updateConnectionDisplay();
                this.startHeartbeatMonitor();

                // Log success
                window.commandHistory?.addEntry({
                    type: 'CONNECTION',
                    timestamp: new Date(),
                    request: { ip, port, mode },
                    response: data,
                    message: `Connected to ${ip}:${port} (${modeLabel})`,
                    success: true
                });
            } else {
                // Try to capture response body for logging
                let errText = '';
                try { errText = await response.text(); } catch (e) { errText = '<unreadable response>'; }

                this.isConnected = false;
                this.updateConnectionDisplay();

                // Log failure
                window.commandHistory?.addEntry({
                    type: 'CONNECTION',
                    timestamp: new Date(),
                    request: { ip, port, mode },
                    response: errText,
                    message: `Failed to connect to ${ip}:${port} (${modeLabel})`,
                    success: false
                });

                alert('Failed to connect to robot');
            }
        } catch (error) {
            console.error('Connection error:', error);
            this.isConnected = false;
            this.updateConnectionDisplay();

            // Log exception
            window.commandHistory?.addEntry({
                type: 'CONNECTION',
                timestamp: new Date(),
                request: { ip, port, mode },
                response: String(error),
                message: 'Exception while connecting',
                success: false
            });

            alert('Error: ' + error.message);
        }
    }

    /**
     * Disconnect from robot
     */
    async disconnect() {
        try {
            await fetch('/robot/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            this.isConnected = false;
            this.lastHeartbeat = null;
            this.updateConnectionDisplay();

            if (this.udpHeartbeatTimeout) {
                clearTimeout(this.udpHeartbeatTimeout);
                this.udpHeartbeatTimeout = null;
            }

            window.commandHistory?.addEntry({
                type: 'DISCONNECTION',
                timestamp: new Date(),
                response: `Disconnected from ${this.currentIP}:${this.currentPort}`,
                success: true
            });
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    /**
     * Reconnect to robot
     */
    async reconnect() {
        await this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.connect();
    }

    /**
     * Called when telemetry is received (for UDP heartbeat monitoring)
     */
    onTelemetryReceived() {
        if (this.currentMode === ConnectionType.UDP) {
            this.lastHeartbeat = new Date();
            this.updateConnectionDisplay();
        }
    }

    /**
     * Start monitoring UDP heartbeat
     */
    startHeartbeatMonitor() {
        if (this.currentMode === ConnectionType.TCP) {
            return; // TCP doesn't need heartbeat monitoring
        }

        // Check heartbeat every 2 seconds
        if (this.udpHeartbeatTimeout) {
            clearTimeout(this.udpHeartbeatTimeout);
        }

        this.udpHeartbeatTimeout = setInterval(() => {
            this.checkUDPHeartbeat();
        }, 2000);
    }

    /**
     * Check UDP heartbeat status
     */
    checkUDPHeartbeat() {
        if (!this.isConnected || this.currentMode !== ConnectionType.UDP) {
            return;
        }

        const now = new Date();
        const timeSinceLastHeartbeat = (now - this.lastHeartbeat) / 1000; // seconds

        if (timeSinceLastHeartbeat > 15) {
            // Consider disconnected after 15 seconds without response
            this.isConnected = false;
        } else if (timeSinceLastHeartbeat > 5) {
            // Stale connection warning after 5 seconds
            // Will show as "Stale" in display
        }

        this.updateConnectionDisplay();
    }

    /**
     * Update connection status display
     */
    updateConnectionDisplay() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');

        if (this.isConnected) {
            if (this.currentMode === ConnectionType.UDP) {
                const timeSinceLastHeartbeat = this.lastHeartbeat 
                    ? (new Date() - this.lastHeartbeat) / 1000 
                    : 999;

                if (timeSinceLastHeartbeat < 5) {
                    // Fresh
                    statusIndicator.classList.remove('disconnected', 'stale');
                    statusIndicator.classList.add('connected');
                    statusText.textContent = 'Connected';
                } else {
                    // Stale
                    statusIndicator.classList.remove('disconnected', 'connected');
                    statusIndicator.classList.add('stale');
                    statusText.textContent = 'Stale (no response)';
                }
            } else {
                // TCP
                statusIndicator.classList.remove('disconnected', 'stale');
                statusIndicator.classList.add('connected');
                statusText.textContent = 'Connected';
            }
        } else {
            statusIndicator.classList.remove('connected', 'stale');
            statusIndicator.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        }

        // Update mode display
        const modeLabel = this.currentMode === ConnectionType.TCP ? 'TCP' : 'UDP';
        this.connectionStatus.textContent = this.isConnected ? 'Connected' : 'Disconnected';
        this.connectionMode.textContent = `${this.currentIP}:${this.currentPort} (${modeLabel})`;
    }

    /**
     * Save configuration to localStorage
     */
    saveConfig() {
        const config = {
            ip: this.currentIP,
            port: this.currentPort,
            mode: this.currentMode
        };
        localStorage.setItem('robotConfig', JSON.stringify(config));
    }

    /**
     * Load configuration from localStorage
     */
    loadSavedConfig() {
        try {
            const saved = localStorage.getItem('robotConfig');
            if (saved) {
                const config = JSON.parse(saved);
                this.robotIP.value = config.ip || 'localhost';
                this.robotPort.value = config.port || 5000;
                this.socketType.value = config.mode ?? ConnectionType.TCP;
                this.currentIP = config.ip || 'localhost';
                this.currentPort = config.port || 5000;
                this.currentMode = config.mode ?? ConnectionType.TCP;
            }
        } catch (error) {
            console.warn('Could not load saved config:', error);
        }
    }

    /**
     * Initialize connection on page load
     */
    initializeConnection() {
        // Check if we were previously connected
        try {
            const response = fetch('/robot/check-connection', { method: 'GET' });
            response.then(res => {
                if (res.ok) {
                    res.json().then(data => {
                        if (data.connected) {
                            this.isConnected = true;
                            this.lastHeartbeat = new Date();
                            this.startHeartbeatMonitor();
                        }
                        this.updateConnectionDisplay();
                    });
                }
            });
        } catch (error) {
            console.log('Connection check failed, assuming disconnected');
            this.updateConnectionDisplay();
        }
    }

    /**
     * Get current connection info
     */
    getConnectionInfo() {
        return {
            isConnected: this.isConnected,
            ip: this.currentIP,
            port: this.currentPort,
            mode: this.currentMode,
            endpoint: `${this.currentIP}:${this.currentPort}`
        };
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    window.connectionConfig = new ConnectionConfig();
});
