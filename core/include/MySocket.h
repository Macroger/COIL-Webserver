#pragma once
#include <string>
#include "types.h"
#include "constants.h"

// POSIX socket includes (Linux target)
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <netdb.h>
#include <cstring>
#include <cerrno>

using namespace std;

// Define a platform-agnostic socket handle type for the project.
using SocketHandle = int;
constexpr SocketHandle INVALID_SOCKET = -1;
namespace coil::protocol
{
	
	class MySocket
	{
	private:

		// Internal buffer for receiving data
		char* buffer;

		// Socket address structure for the server
		sockaddr_in LocalAddr;   // used with bind()
		sockaddr_in RemoteAddr;  // used with connect() / sendto()

		// Listening socket for TCP
		SocketHandle WelcomeSocket; 

		// Accepted connection socket for message transfer
		SocketHandle ConnectionSocket; 
		
		// Holds the type of socket this object has been configured as.
		SocketType SockType;

		// Holds the type of connection this socket is using (TCP or UDP).
		ConnectionType ConnType;
		
		// IP address for the socket connection
		string IPAddr;
		
		// Port number for the socket connection
		uint16_t Port;

		// Buffer size for receiving data
		uint8_t MaxSize;

		// Flag to track TCP connection status
		bool bTCPConnected;

		int recvTimeoutSeconds;
		uint packetSentCount;
		uint packetReceivedCount;

	public:
		MySocket(SocketType, ConnectionType, uint16_t, uint8_t, string);
		~MySocket();


		void ConnectTCP();
		void DisconnectTCP();
		void InvalidateSockets();
		void CreateSocket();
		
		bool ValidateIPAddress(string);
		bool AcceptConnection(int timeoutSeconds = coil::protocol::constants::DEFAULT_SOCKET_TIMEOUT);

		int GetData(char*);
		void SendData(const char* data, int size);

		std::string GetIPAddr();
		int GetPort();
		SocketType GetType();
		ConnectionType GetConnectionType();

		void SetType(SocketType);
		void SetSocketPort(int); 
		void SetIPAddr(std::string);
		void SetConnectionType(ConnectionType connType);
		void SetReceiveTimeout(int timeoutSeconds);

		bool IsConnected() const;
		bool Ping(int attempts);
		coil::protocol::RobotTelemetry GetTelemetry();
	};
}


