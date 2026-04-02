#pragma once
#include <cstdint>

namespace coil::protocol
{
	/// <summary>
	/// Represents the possible command types that can be sent in a packet.
	/// </summary>
	enum class CmdType : uint8_t
	{
		DRIVE,
		SLEEP,
		RESPONSE,
		UNKNOWN
	};

	/// <summary>
	/// Represents the possible drive directions for a drive command.
	/// </summary>
	enum class Drive : uint8_t
	{
		FORWARD = 1,
		BACKWARD = 2,
		RIGHT = 3,
		LEFT = 4
	};

	enum class SocketType : uint8_t
	{
		CLIENT,
		SERVER
	};

	enum class ConnectionType : uint8_t
	{
		TCP,
		UDP
	};

	/// <summary>
	/// Represents the body of a drive command, which includes the direction, duration, and power of the drive action.
	/// </summary>
	struct DriveBody
	{
		uint8_t direction;
		uint8_t duration;
		uint8_t power;
	};

	/// <summary>
	/// Represents the body of a turn command, which includes the direction and duration of the turn.
	/// </summary>
	struct TurnBody
	{
		uint8_t direction;
		uint16_t duration;
	};

	/// <summary>
	/// Represents a packet header with control bits and metadata. 
	/// It is 4 bytes long.
	/// </summary>
	#pragma pack(push, 1) // Ensure no padding is added by the compiler
	struct Header
	{
		// Do not change order - this matches the packet protocol and should not be changed.
		uint16_t pktCount;
		uint8_t driveBit : 1;
		uint8_t statusBit : 1;
		uint8_t sleepBit : 1;
		uint8_t ackBit : 1;
		uint8_t padding : 4;
		uint8_t packetLength;
	};
	#pragma pack(pop) // End of packed structure


	/// <summary>
	/// Telemetry data structure received from the robot simulator.
	/// Contains status information about the robot's current state.
	/// </summary>
	struct RobotTelemetry
	{
		uint16_t LastPktCounter;  // Last commanded packet counter received by robot
		uint16_t CurrentGrade;    // Current grade during demonstration
		uint16_t HitCount;        // Number of hits encountered during demonstration
		uint16_t Heading;         // Current direction/turn duration [EXPERIMENTAL]
		uint8_t LastCmd;          // Last drive command received (maps to Drive enum)
		uint8_t LastCmdValue;     // Last drive forward/backward duration value
		uint8_t LastCmdPower;     // Last drive forward/backward power value

		/// <summary>
		/// Deserializes binary data from a packet body into a RobotTelemetry struct.
		/// Assumes network byte order (big-endian) for multi-byte values.
		/// </summary>
		/// <param name="data">Pointer to the packet body data</param>
		/// <param name="length">Length of the data buffer (must be at least 13 bytes)</param>
		/// <returns>Populated RobotTelemetry struct</returns>
		static RobotTelemetry Deserialize(const unsigned char*, std::size_t);
			

		/// <summary>
		/// Converts the LastCmd byte to a readable Drive enum value.
		/// </summary>
		/// <returns>Drive direction enum</returns>
		Drive GetLastDriveDirection() const;

		/// <summary>
		/// Pretty-prints the telemetry data to console.
		/// </summary>
		void Print() const;
	};
}