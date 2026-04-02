#pragma once
#include <string>
#include "types.h"
#include "constants.h"

// Platform-specific includes - guarded so Linux builds use POSIX sockets
#ifdef _WIN32
	#include <WinSock2.h>
	#include <WS2tcpip.h>
	#pragma comment(lib, "Ws2_32.lib")
	typedef SOCKET SocketHandle;
#else
	#include <sys/socket.h>
	#include <netinet/in.h>
	#include <arpa/inet.h>
	#include <unistd.h>
	typedef int SocketHandle;
	#define INVALID_SOCKET -1
	#define SOCKET_ERROR -1
#endif

using namespace std;
namespace coil::protocol
{
	
	class MySocket
	{
	private:

		// Internal buffer for receiving data
		char* buffer;

		// Socket address structure for the server
		sockaddr_in SvrAddr;

		// Listening socket for TCP
		SOCKET WelcomeSocket; 

		// Accepted connection socket for message transfer
		SOCKET ConnectionSocket; 
		
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

		bool wsaOwned;

	public:
		MySocket(SocketType, ConnectionType, uint16_t, uint8_t, string);
		~MySocket();


		void ConnectTCP();
		void DisconnectTCP();
		void SendData(const char* data, int size);
		bool ValidateIPAddress(string);
		bool AcceptConnection(int timeoutSeconds = coil::protocol::constants::DEFAULT_SOCKET_TIMEOUT);

		int GetData(char*, int timeoutSeconds = 0);	// Timeout of 0 equals no timeout (blocking call)
		std::string GetIPAddr();
		int GetPort();
		SocketType GetType();
		void SetType(SocketType);
		void SetPort(int); //intellisence thinks SetPort is from the Windows.h "#define SetPort SetPortW"
		void SetIPAddr(std::string);
	};
}


