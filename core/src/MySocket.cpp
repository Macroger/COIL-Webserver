// Linux-only cleanup
#include "MySocket.h"
#include "pktdef.h"
#include <format>
#include <stdexcept>
#include <cstring>
using namespace coil::protocol::constants;
namespace coil::protocol
{
		/// <summary>
	/// Constructs a MySocket object with the specified socket configuration and validates the input parameters.
	/// </summary>
	/// <param name="socketType">The type of socket to create. Server or Client.</param>
	/// <param name="connectionType">The type of connection to establish. TCP or UDP.</param>
	/// <param name="port">The port number to use (must be less than 65535).</param>
	/// <param name="bufferSize">The size of the buffer for packet handling. If outside valid range, defaults to DEFAULT_SIZE.</param>
	/// <param name="targetIPAddress">The target IP address in string format.</param>
	MySocket::MySocket(SocketType socketType, ConnectionType connectionType, uint16_t port, uint8_t bufferSize, string targetIPAddress)
	{
		// Perform validations on incomming items
		if (port >= MAX_PORT_NUMBER) throw std::invalid_argument(std::format("Invalid Port: {}. Port number must be between 0 and {}", port, MAX_PORT_NUMBER));
		
		// Check if the provided IP address is in a valid format using the ValidateIPAddress method. 
		if (ValidateIPAddress(targetIPAddress) == false) throw std::invalid_argument("Invalid IP address format");
		
		// If provided maxSize is outside valid range for packet sizes, set it to the default buffer size to ensure it can accommodate any valid packet.
		if (bufferSize < MIN_PKT_SIZE || bufferSize > MAX_PKT_SIZE) bufferSize = DEFAULT_SIZE;

		// --- Initialize configuration state ---
		SockType			= socketType;
		ConnType			= connectionType;
		Port				= port;
		IPAddr				= targetIPAddress;
		MaxSize				= bufferSize;
		bTCPConnected		= false;
		recvTimeoutSeconds	= DEFAULT_SOCKET_TIMEOUT;
		ConnectionSocket	= INVALID_SOCKET;
		WelcomeSocket		= INVALID_SOCKET;
		buffer				= nullptr;
		packetSentCount		= 0;
		packetReceivedCount = 0;

		// --- Allocate receive buffer ---
		buffer = new char[MaxSize];			// Setup internal buffer for receiving data - allocate memory for the buffer based on the specified buffer size.
		std::memset(buffer, 0, MaxSize);	// zero-initialize (zero-out the buffer to ensure it starts in a known state)
		
		try
		{
			// Initialize address structures to zero to ensure they start in a known state and prevent potential issues with uninitialized memory.
			memset(&LocalAddr, 0, sizeof(LocalAddr));
			memset(&RemoteAddr, 0, sizeof(RemoteAddr));

			// Set up Local address structure
			LocalAddr.sin_family = AF_INET;
			LocalAddr.sin_port = htons(Port);
			LocalAddr.sin_addr.s_addr = INADDR_ANY;

			// Set up the Remote address structure, which will be used for connecting to a server (client mode) or sending data to a specific address (UDP client mode).
			RemoteAddr.sin_family = AF_INET;
			RemoteAddr.sin_port = htons(Port);

			if (inet_pton(AF_INET, IPAddr.c_str(), &RemoteAddr.sin_addr) <= 0)
				throw std::invalid_argument("Invalid IP address format");

			//  Create the initial socket
			CreateSocket();
		}
		catch (...)
		{
			// --- Cleanup on constructor failure ---
			if (ConnectionSocket != INVALID_SOCKET)
			{
				::close(ConnectionSocket);
				ConnectionSocket = INVALID_SOCKET;
			}

			if (buffer)
			{
				delete[] buffer;
				buffer = nullptr;
			}

			// No WinSock cleanup needed on POSIX
			throw;  // re-throw original exception
		}
	}

	/// <summary>
	/// Destructor to clean up resources after the MySocket object is destroyed.
	/// It ensures that any dynamically allocated memory is freed and that any open sockets are properly closed to prevent resource leaks.
	/// </summary>
	MySocket::~MySocket()
	{
		delete[] buffer;
		buffer = nullptr;

		if (ConnectionSocket != INVALID_SOCKET)
			::close(ConnectionSocket);

		if (WelcomeSocket != INVALID_SOCKET && WelcomeSocket != ConnectionSocket)
			::close(WelcomeSocket);
	}

	/// <summary>
	/// Establishes a TCP connection, either by connecting to a server (client mode) or accepting a client connection (server mode).
	/// </summary>
	void MySocket::ConnectTCP()
	{
		if (this->ConnType != ConnectionType::TCP) throw std::runtime_error("ConnectTCP can only be called for TCP connections");
		
		if (bTCPConnected) throw std::runtime_error("Unable to connect. Already connected.");; // Already connected, no need to connect again

		// If the socket is invalid, create a new one. 
		// This allows for ConnectTCP to be called again after a disconnect without requiring the user to manually call CreateSocket.
		if (ConnectionSocket == INVALID_SOCKET) CreateSocket();

		if (this->SockType == SocketType::CLIENT)
		{
			// For a TCP client, we need to connect to the server using the specified IP and port.
			if (connect(ConnectionSocket, (sockaddr*)&RemoteAddr, sizeof(RemoteAddr)) < 0)
			{
				throw std::runtime_error(std::string("Failed to connect to server: ") + std::strerror(errno));
			}

			bTCPConnected = true; // Set connection status to true after successful connection
		}
		else if (this->SockType == SocketType::SERVER)
		{
			throw std::runtime_error("Server configured connection cannot initiate a connection");
		}
	}

	/// <summary>
	/// Disconnects an active TCP connection and releases the associated socket.
	/// </summary>
	/// <exception> 
	/// std::runtime_error if the connection type is not TCP or if there is no active connection to disconnect.
	/// </exception>
	void MySocket::DisconnectTCP()
	{
		if (ConnType != ConnectionType::TCP) throw std::runtime_error("DisconnectTCP can only be called for TCP connections");
		if (bTCPConnected == false) throw runtime_error("Not currently connected; unable to disconnect.");

		// Gracefully shutdown the connection (disable send/receive)
			shutdown(ConnectionSocket, SHUT_RDWR);
			::close(ConnectionSocket);

			ConnectionSocket = INVALID_SOCKET;  // Mark as invalid
		bTCPConnected = false;
	}

	/// <summary>
	/// Helper method to create a new socket based on the current configuration of the MySocket object. 
	/// It checks for existing sockets and connection status before creating a new socket, and applies necessary options such as receive timeout.
	/// </summary>
	void MySocket::CreateSocket()
	{
		// Check if the socket already exists before attempting to create a new one.
		if (ConnectionSocket != INVALID_SOCKET) throw std::logic_error("CreateSocket called while a socket already exists");

		// Check if the socket is currently connected.
		if (bTCPConnected) throw std::logic_error("CreateSocket called while TCP connection is active");

		// Determine the socket type based on the connection type. TCP uses SOCK_STREAM, while UDP uses SOCK_DGRAM.
		int sockType = (ConnType == ConnectionType::TCP) ? SOCK_STREAM : SOCK_DGRAM;

		ConnectionSocket = socket(AF_INET, sockType, 0);

		if (ConnectionSocket == INVALID_SOCKET)
		{
			throw std::runtime_error(std::string("Failed to create socket: ") + std::strerror(errno));
		}
		
		// Bind is required for:
		//   - All SERVER sockets (TCP or UDP)
		//   - All UDP sockets (client or server)
		if (SockType == SocketType::SERVER || ConnType == ConnectionType::UDP)
		{
			if (bind(ConnectionSocket,
				reinterpret_cast<sockaddr*>(&LocalAddr),
				sizeof(LocalAddr)) < 0)
			{
				int err = errno;
				::close(ConnectionSocket);
				ConnectionSocket = INVALID_SOCKET;
				throw std::runtime_error(std::string("Failed to bind socket: ") + std::strerror(err));
			}
		}

		// --- Listen if TCP server ---
		if (SockType == SocketType::SERVER && ConnType == ConnectionType::TCP)
		{
			if (listen(ConnectionSocket, 1) < 0)
			{
				int err = errno;
				::close(ConnectionSocket);
				ConnectionSocket = INVALID_SOCKET;
				throw std::runtime_error(std::string("Failed to listen on socket: ") + std::strerror(err));
			}

			// Listening socket is the connection socket until accept()
			WelcomeSocket = ConnectionSocket;
		}
		else
		{
			// Non-server sockets must not have a welcome socket
			WelcomeSocket = INVALID_SOCKET;
		}

		// --- Apply socket options ---
		// Safe to do only after bind/listen decisions are complete.
		SetReceiveTimeout(recvTimeoutSeconds);
	}

	/// <summary>
	/// Receives data from the socket (TCP or UDP) and copies it into the
	/// caller‑provided buffer. For TCP, this function uses recv(). For UDP,
	/// it uses recvfrom() and updates the stored server address. The received
	/// bytes are first placed into the internal buffer and then copied into mAddr.
	/// Throws an exception if the receive operation fails or if copying fails.
	/// </summary>
	/// <param name="mAddr">
	/// Pointer to a caller‑allocated buffer where the received data will be copied.
	/// The buffer must be large enough to hold the number of bytes returned.
	/// </param>
	/// <returns>
	/// Number of bytes copied into mAddr. A return value of 0 indicates a graceful
	/// TCP connection close.
	/// </returns>
	int MySocket::GetData(char* mAddr)
	{
		if (ConnectionSocket == INVALID_SOCKET) CreateSocket();

		int bytecount = 0;

		//Check if connection is TCP or UDP
		if (ConnType == ConnectionType::TCP)
		{
			bytecount = recv(ConnectionSocket, buffer, MaxSize, 0);
		}
		else
		{
			socklen_t addrLen = sizeof(RemoteAddr);
			bytecount = recvfrom(ConnectionSocket, buffer, MaxSize, 0,
				(sockaddr*)&RemoteAddr, &addrLen);
		}

		// Error check (check if bytes have been received)
		if (bytecount < 0)
		{
			if (errno == EWOULDBLOCK || errno == EAGAIN)
			{
				return 0;  // Timeout / non-blocking no-data
			}
			else
			{
				throw std::runtime_error(std::string("GetData Error: Socket failure: ") + std::strerror(errno));
			}
		}

		// Check if the connection was closed by the peer (TCP) - if recv returns 0,
		// it means the connection has been gracefully closed by the peer.
		if (bytecount == 0)
		{
			if (this->ConnType == ConnectionType::TCP)
			{
				::close(ConnectionSocket);
				ConnectionSocket = INVALID_SOCKET;
				bTCPConnected = false;
				return 0;
			}
			else if (this->ConnType == ConnectionType::UDP)
			{
				throw std::runtime_error("GetData Error: Received 0 bytes from UDP socket, which violates protocol");
			}
		}

		//Copy buffer to recieved memory address
		// Copy received bytes into caller buffer
		std::memcpy(mAddr, buffer, static_cast<size_t>(bytecount));

		packetReceivedCount++;

		return bytecount; // return the number of bytes written to mAddr
	}

	/// <summary>
	/// Sends data over the socket connection. For TCP, it sends data over the established connection socket.
	/// For UDP, it sends data to the specified address and port without needing an established connection.
	/// </summary>
	/// <param name="data"></param>
	/// <param name="size"></param>
	void MySocket::SendData(const char* data, int size)
	{
		// Validation
		if (data == nullptr) throw std::invalid_argument("data cannot be null");
		if (size <= 0) throw std::invalid_argument("size must be greater than 0");
		if (size > MaxSize) throw std::invalid_argument(std::format("size ({} bytes) exceeds configured buffer size ({} bytes)", size, MaxSize));
			
		// Check if the socket is valid before attempting to send data. If the socket is invalid, we attempt to create a new one.
		if (ConnectionSocket == INVALID_SOCKET) CreateSocket();

		// Check if in TCP mode and connected before attempting to send data
		if (this->ConnType == ConnectionType::TCP)
		{
			// Check if connected before sending data - if not connected, we throw an exception with an error message.
			if (!bTCPConnected) throw std::runtime_error("Not connected to a TCP peer; unable to send data.");

			// Use send for TCP connections, which sends data over the established connection socket.
			ssize_t bytesSent = send(ConnectionSocket, data, size, 0);

			// Check if the send operation was successful and throw an exception if it fails.
			if (bytesSent < 0) throw std::runtime_error(std::string("Failed to send data: ") + std::strerror(errno));

			// Double check that the correct number of bytes was sent. If not, throw an exception.
			if (bytesSent != size) throw std::runtime_error("Partial send occurred");
		}
		else if (this->ConnType == ConnectionType::UDP)
		{
			// Send data using sendto for UDP connections, which sends data to the specified address and port
			// without needing an established connection.
			ssize_t bytesSent = sendto(ConnectionSocket, data, size, 0, (sockaddr*)&RemoteAddr, sizeof(RemoteAddr));

			// Check if the send operation was successful and throw an exception if it fails.
			if (bytesSent < 0) throw std::runtime_error(std::string("Failed to send data: ") + std::strerror(errno));

			// Double check that the correct number of bytes was sent. If not, throw an exception.
			if (bytesSent != size) throw std::runtime_error("Partial send occurred");
			
		}

		packetSentCount++;
	}

	/// <summary>
	/// Validates whether a string is a valid IPv4 address.
	/// </summary>
	/// <param name="IPAddress">The string to validate as an IPv4 address.</param>
	/// <returns>true if the string is a valid IPv4 address; otherwise, false.</returns>
	bool MySocket::ValidateIPAddress(string IPAddress)
	{
		in_addr addr;
		return inet_pton(AF_INET, IPAddress.c_str(), &addr) == 1;
	}

	/// <summary>
	/// Accepts an incoming TCP connection with a specified timeout period.
	/// </summary>
	/// <param name="timeoutSeconds">The maximum time in seconds to wait for an incoming connection before timing out.</param>
	/// <returns>Returns true if a connection was successfully accepted, or false if the timeout period elapsed without a connection.
	/// Throws an exception if the socket is not a TCP server or if an error occurs.</returns>
	bool MySocket::AcceptConnection(int timeoutSeconds)
	{
		// Check if the socket is configured as a TCP server, as only TCP servers can accept incoming connections. 
		// If it is not a TCP server, we throw an exception with an error message.
		if (SockType != SocketType::SERVER || ConnType != ConnectionType::TCP)
			throw std::runtime_error("Only TCP servers can accept connections");


		if (WelcomeSocket == INVALID_SOCKET)
			throw std::logic_error("AcceptConnection called with invalid WelcomeSocket");		

		// --- Prepare for select() ---
		fd_set readfds;
		FD_ZERO(&readfds);
		FD_SET(WelcomeSocket, &readfds);

		timeval tv;
		tv.tv_sec = timeoutSeconds;
		tv.tv_usec = 0;

		// --- Wait for incoming connection ---
		int ready = select(
			WelcomeSocket + 1,
			&readfds,
			nullptr,
			nullptr,
			&tv
		);

		// --- Handle select() result ---
		if (ready == 0) return false;

		// Check if an error occurred during select
		if (ready < 0)
		{
			throw std::runtime_error(std::string("select() failed: ") + std::strerror(errno));
		}

		// Now we call accept, which will not block because we already know there is a pending connection via select.
		ConnectionSocket = accept(WelcomeSocket, NULL, NULL);

		// If accept returns INVALID_SOCKET, throw an exception with the appropriate error message.
		if (ConnectionSocket == INVALID_SOCKET)
		{
			throw std::runtime_error(std::string("accept() failed: ") + std::strerror(errno));
		}

		return true;  // Client successfully connected
	}


	/// <summary>
	/// Retrieves IP address configured within MySocket
	/// </summary>
	/// <returns>IPAddr</returns>
	std::string MySocket::GetIPAddr() { // returns IP address configured within the MySocket object
		return this->IPAddr;
	}

	/// <summary>
	/// Retrieves Port Number stored within MySocket
	/// </summary>
	/// <returns>Port</returns>
	int MySocket::GetPort() { // returns port number configured within the MySocket object
		return this->Port;
	}

	/// <summary>
	/// Retrieves SocketType stored within MySocket
	/// </summary>
	/// <returns>SockType</returns>
	SocketType MySocket::GetType() {
		return this->SockType;
	}

	/// <summary>
	/// Gets the connection type (TCP or UDP) for the socket. This indicates whether the socket is configured to use TCP or UDP for communication.
	/// </summary>
	/// <returns></returns>
	ConnectionType MySocket::GetConnectionType()
	{
		return this->ConnType;
	}

	/// <summary>
	/// Changes the default socket type within the MySocket object. 
	/// </summary>
	/// <param name="type">SocketType: SERVER or CLIENT.</param>
	void MySocket::SetType(SocketType type) {
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetType not permittd: TCP session is already established");
		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetType not permittd: Welcome Socket is Open");

		this->SockType = type;

		// Changing type invalidates socket identity
		InvalidateSockets();
	}

	/// <summary>
	/// Changes the default port number within MySoket, 
	/// </summary>
	/// <param name="port"></param>
	void MySocket::SetSocketPort(int port) {
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetPort not permittd: TCP session is already established");
		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetPort not permittd: Welcome Socket is Open");

		// Reject if port number is invalid (must be between 0 and 65535)
		if (port >= MAX_PORT_NUMBER || port <= 0) throw std::invalid_argument(std::format("Invalid Port: {}. Port number must be between 1 and {}", port, MAX_PORT_NUMBER));

		this->Port = port;

		LocalAddr.sin_port = htons(port);
		RemoteAddr.sin_port = htons(port);


		// Changing port invalidates socket identity
		InvalidateSockets();
	}

	/// <summary>
	/// Changes the default IP address within MySoket
	/// </summary>
	/// <param name="IPaddr"></param>
	void MySocket::SetIPAddr(std::string IPaddr) {
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetIPAddr not permittd: TCP session is already established");
		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetIPAddr not permittd: Welcome Socket is Open");

		this->IPAddr = IPaddr;

		inet_pton(AF_INET, IPAddr.c_str(), &RemoteAddr.sin_addr);

		// Changing IPAddr invalidates socket identity
		InvalidateSockets();
	}

	/// <summary>
	/// Adjust the connection type (TCP or UDP) for the socket. Changing the type invalidates the current socket(s), so can't be done while tcp connection is active.
	/// </summary>
	/// <param name="connType"></param>
	void MySocket::SetConnectionType(ConnectionType connType)
	{
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetConnectionType not permittd: TCP session is already established");
		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetConnectionType not permittd: Welcome Socket is Open");

		if (ConnType != connType)
		{
			this->ConnType = connType;

			// Changing connection type invalidates socket identity
			InvalidateSockets();
		}		
	}

	/// <summary>
	/// Sets the receive timeout for the socket connection. This timeout determines how long the socket will wait for incoming data before timing out.
	/// </summary>
	/// <param name="timeoutSeconds"></param>
	void MySocket::SetReceiveTimeout(int timeoutSeconds)
	{		
		// If the timeoutSeconds is below 0, we throw an exception with an error message.
		if (timeoutSeconds < 0) throw std::invalid_argument("Receive timeout must be >= 0 seconds");

		// No change in timeout, skip setting
		if (timeoutSeconds == recvTimeoutSeconds) return;

		// Check if the ConnectionSocket is valid before attempting to set the timeout. If it is not valid, we throw an exception with an error message.
		if (ConnectionSocket == INVALID_SOCKET) throw std::runtime_error("Cannot set receive timeout: Socket is not valid");

		// Set a timeout value for the ConnectionSocket using setsockopt with timeval on POSIX
		struct timeval tv;
		tv.tv_sec = timeoutSeconds;
		tv.tv_usec = 0;

		if (setsockopt(
			ConnectionSocket,
			SOL_SOCKET,
			SO_RCVTIMEO,
			&tv,
			sizeof(tv)) < 0)
		{
			throw std::runtime_error(std::string("Failed to set receive timeout (SO_RCVTIMEO): ") + std::strerror(errno));
		}

		// Store the timeout value for future reference.
		recvTimeoutSeconds = timeoutSeconds;
	}

	/// <summary>
	/// Invalidates the current sockets by closing any open sockets and marking them as invalid.
	/// This is used to reset the socket state when changing configuration parameters that affect the socket identity (e.g., type, port, IP address, connection type).
	/// </summary>
	/// <remarks> 
	/// Any change to socket identity (port, IP, protocol, socket type) invalidates all existing OS sockets. New sockets are created on the next connection attempt.
	/// </remarks>
	void MySocket::InvalidateSockets()
	{
		if (ConnectionSocket != INVALID_SOCKET)
		{
			::close(ConnectionSocket);

			ConnectionSocket = INVALID_SOCKET;
		}

		if (WelcomeSocket != INVALID_SOCKET)
		{
			::close(WelcomeSocket);

			WelcomeSocket = INVALID_SOCKET;
		}

		bTCPConnected = false;
	}

	/// @brief Checks if the TCP connection is currently established
	/// @return true if connected, false otherwise
	bool MySocket::IsConnected() const
	{
		if (ConnType == ConnectionType::UDP)
			return (ConnectionSocket != INVALID_SOCKET);
		return bTCPConnected;
	}

	RobotTelemetry MySocket::GetTelemetry()
	{
		// Check if in TCP mode and connected before attempting to get data
		if (this->ConnType == ConnectionType::TCP)
		{
			// Check if connected before getting data - if not connected, we throw an exception with an error message.
			if (!bTCPConnected) throw std::runtime_error("In TCP mode but not connected to a TCP peer; unable to get telemetry.");
		}
	
		// Build minimal ping packet
		coil::protocol::PktDef pkt;
		pkt.SetPktCount(packetSentCount +1); // Set packet count to one more than the number of packets we've sent so far, to ensure a unique packet count for this telemetry request.
		pkt.SetCmd(coil::protocol::CmdType::RESPONSE);

		const char* out = pkt.GenPacket();
		int outSize = pkt.GetLength();

		const int bufMax = coil::protocol::constants::MAX_PKT_SIZE;
		char recvBuf[bufMax];

		SendData(out, outSize); // SendData handles UDP/TCP correctly

		int bytesRead = GetData(recvBuf);
		if (bytesRead <= 0) throw std::runtime_error("Failed to receive telemetry ACK / NACK response. No data received.");

		// At this point we may receive ACK and telemetry as two separate recv() calls (UDP or TCP split),
		// or both packets may be coalesced into a single TCP recv. Handle both cases.

		// Ensure we have enough bytes for a header
		if (bytesRead < HEADER_SIZE) throw std::runtime_error("Received data too short to contain packet header");

		// Parse first header to find first packet length
		uint8_t headerBytes[HEADER_SIZE];
		std::memcpy(headerBytes, recvBuf, HEADER_SIZE);
		Header firstHdr{};
		{
			PktDef helper; // use helper to parse header bytes
			helper.ParseHeaderBytes(headerBytes, firstHdr, Endianness::LittleEndian);
		}

		int firstPktLen = firstHdr.packetLength;
		if (bytesRead < firstPktLen) {
			// partial read for first packet - attempt to read remaining bytes
			int remaining = firstPktLen - bytesRead;
			int more = GetData(recvBuf + bytesRead);
			if (more <= 0) throw std::runtime_error("Failed to receive full ACK response. No data received.");
			bytesRead += more;
			if (bytesRead < firstPktLen) throw std::runtime_error("Failed to receive full ACK response. Incomplete packet.");
		}

		// Construct PktDef for the first packet only (use exact length)
		PktDef response = PktDef(recvBuf, firstPktLen);
		bool isAck = response.GetAck();
		if (!isAck) throw std::runtime_error("Received NACK response to telemetry request, no telemetry data will be sent.");

		// If we received extra bytes in the same recv, try to parse the telemetry packet(s) from the buffer
		if (bytesRead > firstPktLen) {
			int offset = firstPktLen;
			// We expect the next bytes to start with a header
			if (bytesRead - offset >= HEADER_SIZE) {
				std::memcpy(headerBytes, recvBuf + offset, HEADER_SIZE);
				Header secondHdr{};
				PktDef helper2;
				helper2.ParseHeaderBytes(headerBytes, secondHdr, Endianness::LittleEndian);
				int secondPktLen = secondHdr.packetLength;
				if (bytesRead - offset >= secondPktLen) {
					// We have the full telemetry packet in the leftover bytes
					PktDef telemPkt(recvBuf + offset, secondPktLen);
					char* bodyPtr = telemPkt.GetBodyData();
					int bodyLen = telemPkt.GetLength() - MIN_PKT_SIZE;
					RobotTelemetry telem = RobotTelemetry::Deserialize(reinterpret_cast<unsigned char*>(bodyPtr), static_cast<std::size_t>(bodyLen));
					return telem;
				}
			}
		}

		// Otherwise, read the telemetry packet from the socket as before
		char telemBuf[bufMax];
		int teleBytes = GetData(telemBuf);
		if (teleBytes <= 0) throw std::runtime_error("Failed to receive telemetry data after ACK response. No data received.");

		// Parse the telemetry packet to extract body then deserialize
		PktDef telemPkt(telemBuf, teleBytes);
		char* bodyPtr = telemPkt.GetBodyData();
		int bodyLen = telemPkt.GetLength() - MIN_PKT_SIZE;
		RobotTelemetry telem = RobotTelemetry::Deserialize(reinterpret_cast<unsigned char*>(bodyPtr), static_cast<std::size_t>(bodyLen));

		return telem;
	}

	bool MySocket::Ping(int retries)
	{
		// Only meaningful for UDP probes, but supports TCP by sending and expecting a reply.
		if (retries < 1) retries = 1;

		// Build minimal ping packet
		coil::protocol::PktDef pkt;
		pkt.SetCmd(coil::protocol::CmdType::RESPONSE);

		const char* out = pkt.GenPacket();
		int outSize = pkt.GetLength();

		const int bufMax = coil::protocol::constants::MAX_PKT_SIZE;
		char recvBuf[bufMax];

		for (int attempt = 0; attempt < retries; ++attempt)
		{
			try 
			{
				SendData(out, outSize); // SendData handles UDP/TCP correctly
				
				int received = GetData(recvBuf);
				if (received > 0) return true;

				// Check if the response was an ACK or a NACK
				PktDef response = PktDef(recvBuf, received);
				bool isAck = response.GetAck();
				
				// Is a NACK - our response was not accepted so no more messages are coming.
				// However, it does mean we got a message.
				if (!isAck) return true; 

				// This is a telem request, it will contain a second response which we should consume.
				int discard = GetData(recvBuf);
				if (discard > 0) return true;
			} 
			catch (...) 
			{
				// sending failed — try again (or bail if you prefer)
				continue;
			}

			// else loop to retry
		}
		return false;
	}
}
