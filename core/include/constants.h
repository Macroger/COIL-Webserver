#pragma once
#include <cstdint>

namespace coil::protocol::constants
{
	// Packet structure sizes
	inline constexpr uint8_t HEADER_SIZE = 4;

	// CRC size (1 byte)
	inline constexpr uint8_t CRC_SIZE = 1;

	// Head + Tail (CRC) size - the minimum packet size if there is no body segment.
	inline constexpr uint8_t MIN_PKT_SIZE = HEADER_SIZE + CRC_SIZE;

	// Max body size - based on the fact that body length is stored in a single byte in the header, so max value is 250
	inline constexpr uint8_t MAX_BODY_SIZE = 250;

	// Max packet size - the total size of the packet including header, body, and CRC. This is the maximum amount of data that can be sent in a single packet.
	inline constexpr uint8_t MAX_PKT_SIZE = MAX_BODY_SIZE + MIN_PKT_SIZE;

	// Packet limits - the max number of packets that can be sent in a single session before the packet count rolls over back to 0.
	// This is based on the fact that packet count is stored in a uint16_t, so max value is 65535.
	inline constexpr uint16_t MAX_PKT_COUNT = 65535;

	// Max Port number
	inline constexpr uint16_t MAX_PORT_NUMBER = 65535;

	// Default buffer size for receiving data - set to the maximum packet size to ensure we can receive any valid packet in one go.
	inline constexpr uint8_t DEFAULT_SIZE = MAX_PKT_SIZE;

	// Default timeout for socket operations in seconds
	inline constexpr uint8_t DEFAULT_SOCKET_TIMEOUT = 30; 
	
	// Drive direction values (matching Drive enum)
	inline constexpr uint8_t FORWARD = 1;
	inline constexpr uint8_t BACKWARD = 2;
	inline constexpr uint8_t RIGHT = 3;
	inline constexpr uint8_t LEFT = 4;

	// Default values
	inline constexpr uint8_t DEFAULT_POWER = 80;
	inline constexpr uint8_t DEFAULT_DURATION = 3;
	inline constexpr uint8_t MIN_DURATION = 1;
}
