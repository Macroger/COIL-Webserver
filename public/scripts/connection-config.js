/**
 * Connection Configuration Module
 * Handles robot connection settings, IP/Port configuration, and socket type selection
 */

const ConnectionType = Object.freeze({
    TCP: 0,
    UDP: 1,
    RELAY: 2
});

class ConnectionConfig {
    constructor() {
        this.isConnected = false;
        this.isPending = false;
        this.currentMode = ConnectionType.TCP;
        this.currentIP = 'localhost';
        this.currentPort = 5000;
        this.udpHeartbeatTimeout = null;
        this.lastHeartbeat = null;
        this.sleepSent = false;
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
        this.btnConnectSim = document.getElementById('btnConnectSim');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionMode = document.getElementById('connectionMode');
        this.lastIP = document.getElementById('lastIP');
        this.lastPort = document.getElementById('lastPort');
    }

    attachEventListeners() {
        // Settings panel toggle
        this.btnSettings.addEventListener('click', () => this.toggleSettingsPanel());

        // Connection buttons
        this.btnConnect.addEventListener('click', () => this.connect());
        this.btnDisconnect.addEventListener('click', () => this.disconnect());

        // Simulator preset button
        if (this.btnConnectSim) {
            this.btnConnectSim.addEventListener('click', () => {
                const mode = parseInt(this.socketType.value);
                if (mode === ConnectionType.RELAY) return; // relay target is PC3, not the sim
                const isUDP = mode === ConnectionType.UDP;
                this.robotIP.value = '192.168.118.102';
                this.robotPort.value = isUDP ? '29500' : '29000';

                // Flash the filled fields so the user sees the change
                [this.robotIP, this.robotPort].forEach(el => {
                    el.classList.add('sim-filled');
                    setTimeout(() => el.classList.remove('sim-filled'), 1500);
                });

                // Brief confirmation on the button itself
                const original = this.btnConnectSim.textContent;
                this.btnConnectSim.textContent = '✓ Settings loaded';
                this.btnConnectSim.disabled = true;
                setTimeout(() => {
                    this.btnConnectSim.textContent = original;
                    this.btnConnectSim.disabled = false;
                }, 1500);
            });
        }

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
        if (this.isPending) return;
        const ip = this.robotIP.value;
        const port = parseInt(this.robotPort.value);
        const mode = parseInt(this.socketType.value);

        if (!ip || !port) {
            alert('Please enter valid IP and Port');
            return;
        }

        if (this.isConnected && mode === ConnectionType.TCP) {
            window.robotController?.appendConsole('POST /robot/connect -> REJECTED: already connected (TCP)', 'info');
            return;
        }

        this.isPending = true;
        const modeStr = mode === ConnectionType.UDP ? 'udp' : mode === ConnectionType.RELAY ? 'relay' : 'tcp';
        const modeLabel = mode === ConnectionType.TCP ? 'TCP' : mode === ConnectionType.UDP ? 'UDP' : 'Relay';
        try {
            window.robotController?.appendConsole(`POST /robot/connect -> sending... (${ip}:${port} via ${modeLabel})`, 'info');

            const response = await fetch(`/robot/connect/${encodeURIComponent(ip)}/${port}/${modeStr}`, {
                method: 'POST'});

            if (response.ok) {
                const data = await response.json();
                this.currentIP = ip;
                this.currentPort = port;
                this.currentMode = mode;
                this.isConnected = true;
                this.lastHeartbeat = new Date();
                this.sleepSent = false;
                this.saveConfig();
                this.updateConnectionDisplay();
                this.startHeartbeatMonitor();

                window.robotController?.appendConsole(`POST /robot/connect -> OK (Connected to ${ip}:${port} via ${modeLabel})`, 'info');
                window.commandHistory?.addEntry({
                    type: 'CONNECTION',
                    timestamp: new Date(),
                    request: { ip, port, mode },
                    response: data,
                    message: `Connected to ${ip}:${port} (${modeLabel})`,
                    success: true
                });
            } 
            else 
            {
                let errText = '';
                try { errText = await response.text(); } catch (e) { errText = '<unreadable response>'; }

                this.isConnected = false;
                this.updateConnectionDisplay();

                window.robotController?.appendConsole(`POST /robot/connect -> ERR ${response.status}: ${errText}`, 'info');
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

            window.robotController?.appendConsole(`POST /robot/connect -> EXCEPTION: ${error && error.message ? error.message : String(error)}`, 'info');
            window.commandHistory?.addEntry({
                type: 'CONNECTION',
                timestamp: new Date(),
                request: { ip, port, mode },
                response: String(error),
                message: 'Exception while connecting',
                success: false
            });

            alert('Error: ' + error.message);
        } finally {
            this.isPending = false;
        }
    }

    /**
     * Disconnect from robot
     */
    async disconnect() {
        if (this.isPending) return;

        if (!this.isConnected) {
            const modeLabel = this.currentMode === ConnectionType.TCP ? 'TCP' : this.currentMode === ConnectionType.UDP ? 'UDP' : 'Relay';
            window.robotController?.appendConsole(`POST /robot/disconnect -> REJECTED: not connected (${modeLabel})`, 'info');
            return;
        }

        this.isPending = true;
        try {
            window.robotController?.appendConsole(`POST /robot/disconnect -> requesting... (${this.currentIP}:${this.currentPort})`, 'info');
            const fetchResp = await fetch('/robot/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ skip_sleep: this.sleepSent })
            });

            let disconnectData = null;
            try {
                const ct = fetchResp.headers.get('content-type') || '';
                if (ct.includes('application/json')) disconnectData = await fetchResp.json();
            } catch (_) { /* ignore parse errors */ }

            // Log as separate per-packet SEND/RECV pairs to reflect what actually happened
            const sleepResponse = disconnectData?.sleep_response ?? 'UNKNOWN';
            const sleepPkt = disconnectData?.sleep_pkt_count ?? '?';
            if (this.sleepSent) {
                window.robotController?.appendConsole('SLEEP -> skipped (already sent via button)', 'info');
            } else {
                window.robotController?.appendConsole(`SLEEP pkt #${sleepPkt} -> sent (server-side)`, 'send');
                window.robotController?.appendConsole(`SLEEP pkt #${sleepPkt} -> ${sleepResponse}`, 'recv');
                window.commandHistory?.addEntry({
                    type: 'SLEEP',
                    timestamp: new Date(),
                    success: disconnectData?.sleep_ack === true,
                    response: sleepResponse
                });
            }

            const connCloseLabel = this.currentMode === ConnectionType.TCP ? 'TCP close' : 'UDP socket close';
            const disconnectStatus = fetchResp.ok ? 'OK' : `ERR ${fetchResp.status}`;
            window.robotController?.appendConsole(`${connCloseLabel} -> sent (server-side)`, 'send');
            window.robotController?.appendConsole(`${connCloseLabel} -> ${disconnectStatus} (${this.currentIP}:${this.currentPort})`, 'recv');
            window.commandHistory?.addEntry({
                type: 'DISCONNECTION',
                timestamp: new Date(),
                response: `Disconnected from ${this.currentIP}:${this.currentPort}`,
                success: fetchResp.ok
            });
        } catch (error) {
            console.error('Disconnect error:', error);
        } finally {
            this.isConnected = false;
            this.sleepSent = false;
            this.isPending = false;
            this.updateConnectionDisplay();
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
        let displayText = 'Disconnected';

        if (this.isConnected) {
            if (this.currentMode === ConnectionType.UDP) {
                const timeSinceLastHeartbeat = this.lastHeartbeat 
                    ? (new Date() - this.lastHeartbeat) / 1000 
                    : 999;

                if (timeSinceLastHeartbeat < 5) {
                    // Fresh
                    if (statusIndicator) { statusIndicator.classList.remove('disconnected', 'stale'); statusIndicator.classList.add('connected'); }
                    displayText = 'Connected';
                } else {
                    // Stale
                    if (statusIndicator) { statusIndicator.classList.remove('disconnected', 'connected'); statusIndicator.classList.add('stale'); }
                    displayText = 'Stale (no response)';
                }
            } else {
                // TCP
                if (statusIndicator) { statusIndicator.classList.remove('disconnected', 'stale'); statusIndicator.classList.add('connected'); }
                displayText = 'Connected';
            }
        } else {
            if (statusIndicator) { statusIndicator.classList.remove('connected', 'stale'); statusIndicator.classList.add('disconnected'); }
            displayText = 'Disconnected';
        }
        if (statusText) statusText.textContent = displayText;

        // Update mode display
        const modeLabel = this.currentMode === ConnectionType.TCP ? 'TCP' : this.currentMode === ConnectionType.UDP ? 'UDP' : 'Relay';
        this.connectionStatus.textContent = this.isConnected ? 'Connected' : 'Disconnected';
        this.connectionMode.textContent = `(${modeLabel})`;
        this.lastIP.textContent = this.currentIP;
        this.lastPort.textContent = this.currentPort;

        // Mirror into status cards
        const connCard = document.getElementById('statusCardConnection');
        if (connCard) { const v = connCard.querySelector('.value'); if (v) v.textContent = displayText; }
        const modeCard = document.getElementById('statusCardMode');
        if (modeCard) { const v = modeCard.querySelector('.value'); if (v) v.textContent = modeLabel; }
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
        fetch('/robot/check-connection', { method: 'GET' })
            .then(res => {
                if (res.ok) {
                    return res.json().then(data => {
                        if (data.connected) {
                            this.isConnected = true;
                            this.lastHeartbeat = new Date();
                            this.startHeartbeatMonitor();
                        } else {
                            this.isConnected = false;
                        }
                    });
                } else {
                    this.isConnected = false;
                }
            })
            .catch(() => {
                this.isConnected = false;
            })
            .finally(() => {
                this.updateConnectionDisplay();
            });
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
