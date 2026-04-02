// Linux-only cleanup
#include "MySocket.h"
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
		if (ValidateIPAddress(targetIPAddress) == false) throw std::invalid_argument("Invalid IP address format");
		if (bufferSize < MIN_PKT_SIZE || bufferSize > MAX_PKT_SIZE)
		{
			// If provided maxSize is outside valid range for packet sizes, set it to the default buffer size to ensure it can accommodate any valid packet.
			bufferSize = DEFAULT_SIZE;
		}	
		
		// Initialize TCP connection status to false
		this->ConnectionSocket = INVALID_SOCKET;
		this->WelcomeSocket = INVALID_SOCKET;
		this->ConnType = connectionType;
		this->SockType = socketType;
		this->bTCPConnected = false;
		this->IPAddr = targetIPAddress;
		this->MaxSize = bufferSize;
		this->Port = port;
		this->wsaOwned = false;

		// Setup internal buffer for receiving data - allocate memory for the buffer based on the specified buffer size.
		this->buffer = new char[this->MaxSize];
		memset(buffer, 0, MaxSize);  // zero-initialize (zero-out the buffer to ensure it starts in a known state)		
			
		// Create socket (same on both platforms)		
		// Check if the connection type is TCP or UDP and create the appropriate socket type accordingly.
		// TCP uses SOCK_STREAM, while UDP uses SOCK_DGRAM.
		int sockType = (connectionType == ConnectionType::TCP) ? SOCK_STREAM : SOCK_DGRAM;
		
		// Create the socket using the specified type and protocol.
		ConnectionSocket = socket(AF_INET, sockType, 0);

		// If socket creation failed throw an exception.
		if (ConnectionSocket == INVALID_SOCKET)
		{
			// Clean up before throwing
			delete[] buffer;
			buffer = nullptr;			
			throw std::runtime_error("Failed to create socket");
		}

		// Set up address structure
		SvrAddr.sin_family = AF_INET;
		SvrAddr.sin_port = htons(port);

		switch (SockType)
		{
			case SocketType::SERVER:
				// Initialize server socket and bind to the specified port
				SvrAddr.sin_addr.s_addr = INADDR_ANY;

				   if (bind(ConnectionSocket, (sockaddr*)&SvrAddr, sizeof(SvrAddr)) == SOCKET_ERROR)
				   {
					   close(ConnectionSocket);
					   delete[] buffer;
					   buffer = nullptr;
					   throw std::runtime_error("Failed to bind socket");
				   }

				// IF TCP - Setup the listening socket, but do not call accept yet as that is a blocking call.
				// We will call accept in the ConnectTCP() method when we want to establish the connection,
				// which allows us to control when we block waiting for a client to connect.
				   if (ConnType == ConnectionType::TCP) 
				   {
					   if (listen(ConnectionSocket, 1) == SOCKET_ERROR)
					   {
						   close(ConnectionSocket);
						   delete[] buffer;
						   buffer = nullptr;
						   throw std::runtime_error("Failed to listen on socket");
					   }
					   WelcomeSocket = ConnectionSocket;
				   }
				break;

			case SocketType::CLIENT:
				// Initialize client socket and prepare to connect to the specified IP and port
				// Convert the target IP address from string format to binary format and store it in the SvrAddr structure.
				inet_pton(AF_INET, targetIPAddress.c_str(), &SvrAddr.sin_addr);
				break;
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
			   close(ConnectionSocket);
		   if (WelcomeSocket != INVALID_SOCKET && WelcomeSocket != ConnectionSocket) 
			   close(WelcomeSocket);
	   }
	
	/// <summary>
	/// Establishes a TCP connection, either by connecting to a server (client mode) or accepting a client connection (server mode).
	/// </summary>
	void MySocket::ConnectTCP()
	{
		if (this->ConnType == ConnectionType::UDP) throw std::runtime_error("ConnectTCP can only be called for TCP connections");
		
		if (bTCPConnected) throw std::runtime_error("Unable to connect. Already connected.");; // Already connected, no need to connect again

		if (this->SockType == SocketType::CLIENT)
		{
			// For a TCP client, we need to connect to the server using the specified IP and port.
			if (connect(ConnectionSocket, (sockaddr*)&SvrAddr, sizeof(SvrAddr)) == SOCKET_ERROR) 
			{
				throw std::runtime_error("Failed to connect to server");
			}

			bTCPConnected = true; // Set connection status to true after successful connection
		}
		else if (this->SockType == SocketType::SERVER)
		{
			// For a TCP server, we wait for clients to connect using the AcceptConnection method.
			if (AcceptConnection() == false)
			{
				throw std::runtime_error(std::format("Failed to accept incoming connection within specified timelimit ({} seconds).", DEFAULT_SOCKET_TIMEOUT));
			}
			else
			{
				bTCPConnected = true; // Set connection status to true after successfully accepting a client connection
			}
		}		
	}	
	
	/// <summary>
	/// Disconnects an active TCP connection and releases the associated socket.
	/// </summary>
	   void MySocket::DisconnectTCP()
	   {
		   if (bTCPConnected == false) throw runtime_error("Not currently connected; unable to disconnect.");
		   shutdown(ConnectionSocket, SHUT_RDWR);
		   close(ConnectionSocket);
		   ConnectionSocket = INVALID_SOCKET;
		   bTCPConnected = false;
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
		if (size > MAX_PKT_SIZE)
			throw std::invalid_argument(std::format("Size ({} bytes) exceeds max packet size ({} bytes)", size, MAX_PKT_SIZE));

		// Check if in TCP mode and connected before attempting to send data
		if (this->ConnType == ConnectionType::TCP)
		{
			// Check if connected before sending data - if not connected, we throw an exception with an error message.
			if (!bTCPConnected) throw std::runtime_error("Not connected to a TCP peer; unable to send data.");

			// Use send for TCP connections, which sends data over the established connection socket.
			   int bytesSent = send(ConnectionSocket, data, size, 0);
			   if (bytesSent == SOCKET_ERROR) throw std::runtime_error("Failed to send data");
			   if (bytesSent != size) throw std::runtime_error("Partial send occurred");
		}
		else if (this->ConnType == ConnectionType::UDP)
		{
			// Send data using sendto for UDP connections, which sends data to the specified address and port
			// without needing an established connection.
			   int bytesSent = sendto(ConnectionSocket, data, size, 0, (sockaddr*)&SvrAddr, sizeof(SvrAddr));
			   if (bytesSent == SOCKET_ERROR) throw std::runtime_error("Failed to send data");
			   if (bytesSent != size) throw std::runtime_error("Partial send occurred");
		}
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

		// Set timeout on the listening socket
		   // Convert timeoutSeconds to timeval structure
		   struct timeval tv;
		   tv.tv_sec = timeoutSeconds;
		   tv.tv_usec = 0;
		   if (setsockopt(WelcomeSocket, SOL_SOCKET, SO_RCVTIMEO,
			   (const void*)&tv, sizeof(tv)) < 0) 
		   {
			   throw std::runtime_error("Failed to set socket timeout");
		   }

		// Now we call accept, which will block until a client connects or the timeout is reached.		
		ConnectionSocket = accept(WelcomeSocket, NULL, NULL);

		// If accept returns INVALID_SOCKET, we check if it was due to a timeout or an actual error.
		   if (ConnectionSocket == INVALID_SOCKET) 
		   {
			   // On Linux, accept will return -1 and set errno to EWOULDBLOCK or EAGAIN if the timeout is reached.
			   if (errno == EWOULDBLOCK || errno == EAGAIN) 
			   {
				   return false;  // Timeout
			   }
			   throw std::runtime_error("Failed to accept connection");
		   }

		// Return true to indicate that a client has successfully connected within the timeout period.
		return true; 
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
	int MySocket::GetData(char* mAddr, int timeoutSeconds) 
	{ 

		// Set timeout if specified (similar to your AcceptConnection code)
		   if (timeoutSeconds > 0) 
		   {
			   struct timeval tv;
			   tv.tv_sec = timeoutSeconds;
			   tv.tv_usec = 0;
			   if (setsockopt(ConnectionSocket, SOL_SOCKET, SO_RCVTIMEO,
				   &tv, sizeof(tv)) < 0)
			   {
				   throw std::runtime_error("Failed to set receive timeout");
			   }
		   }
		int bytecount = 0;

		//Check if connection is TCP or UDP
		if (this->ConnType == ConnectionType::TCP) {
			bytecount = recv(ConnectionSocket, buffer, MaxSize, 0);
		}
		else if (this->ConnType == ConnectionType::UDP) {
			socklen_t addrLen = sizeof(SvrAddr);
			bytecount = recvfrom(ConnectionSocket, buffer, MaxSize, 0, (sockaddr*)&SvrAddr, &addrLen);
		}

		// Check if the connection was closed by the peer (TCP) - if recv returns 0,
		// it means the connection has been gracefully closed by the peer.
		if (this->ConnType == ConnectionType::TCP && bytecount == 0)
		{
			bTCPConnected = false;
			return 0; // Connection closed by peer
		}

		//errorcheck (check if bytes have been recieved
		   if (bytecount == SOCKET_ERROR)
		   {
			   if (errno == EWOULDBLOCK || errno == EAGAIN)
			   {
				   return 0;  // Timeout
			   }   
			   else
			   {
				   throw std::runtime_error(std::format("GetData Error: Socket failure code: {}", errno));
			   }
		   }
		   //Copy buffer to received memory address
		   memcpy(mAddr, buffer, bytecount);
		   return bytecount;
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
	/// Changes the default socket type within the MySocket object
	/// </summary>
	/// <param name="type"></param>
	void MySocket::SetType(SocketType type) {
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetType not permittd: TCP session is already established");

		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetType not permittd: Welcome Socket is Open");

		this->SockType = type;
	}

	/// <summary>
	/// Changes the default port number within MySoket, 
	/// </summary>
	/// <param name="port"></param>
	void MySocket::SetPort(int port) {  
		// return an error message if a connection has already been established 
		if (bTCPConnected == true) throw std::runtime_error("SetPort not permittd: TCP session is already established");
		// return error message if welcome socket is open
		if (WelcomeSocket != INVALID_SOCKET) throw std::runtime_error("SetPort not permittd: Welcome Socket is Open");

		// Reject if port number is invalid (must be between 0 and 65535)
		if (port >= MAX_PORT_NUMBER || port <= 0) throw std::invalid_argument(std::format("Invalid Port: {}. Port number must be between 1 and {}", port, MAX_PORT_NUMBER));

		this->Port = port;
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
	}
}
