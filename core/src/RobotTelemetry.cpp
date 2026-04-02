#include "types.h"
#include <iostream>
#include <stdexcept>

namespace coil::protocol
{
	RobotTelemetry RobotTelemetry::Deserialize(const unsigned char* data, std::size_t length)
	{
		if (length < 11) {
			throw std::invalid_argument("Telemetry data too short - expected at least 13 bytes");
		}

		RobotTelemetry telemetry;

		// ⚠️ FIX: Server sends LITTLE-ENDIAN (LSB first), not big-endian!
		// OLD (big-endian):  (data[0] << 8) | data[1]
		// NEW (little-endian): (data[1] << 8) | data[0]

		telemetry.LastPktCounter = (data[1] << 8) | data[0];  // ✅ Changed byte order
		telemetry.CurrentGrade = (data[3] << 8) | data[2];  // ✅ Changed byte order
		telemetry.HitCount = (data[5] << 8) | data[4];  // ✅ Changed byte order
		telemetry.Heading = (data[7] << 8) | data[6];  // ✅ Changed byte order

		// Single-byte values stay the same
		telemetry.LastCmd = data[10];
		telemetry.LastCmdValue = data[11];
		telemetry.LastCmdPower = data[12];

		return telemetry;
	}

	Drive RobotTelemetry::GetLastDriveDirection() const
	{
		return static_cast<Drive>(LastCmd);
	}

	void RobotTelemetry::Print() const
	{
		std::cout << "\n--- Robot Telemetry ---" << std::endl;
		std::cout << "  Last Packet Counter: " << LastPktCounter << std::endl;
		std::cout << "  Current Grade:       " << CurrentGrade << "%" << std::endl;
		std::cout << "  Hit Count:           " << HitCount << std::endl;
		std::cout << "  Heading:             " << Heading << " [EXPERIMENTAL]" << std::endl;

		std::cout << "  Last Command:        ";
		switch (static_cast<Drive>(LastCmd)) {
		case Drive::FORWARD:  std::cout << "FORWARD"; break;
		case Drive::BACKWARD: std::cout << "BACKWARD"; break;
		case Drive::RIGHT:    std::cout << "RIGHT"; break;
		case Drive::LEFT:     std::cout << "LEFT"; break;
		default:              std::cout << "UNKNOWN (" << (int)LastCmd << ")"; break;
		}
		std::cout << std::endl;

		std::cout << "  Last Cmd Duration:   " << (int)LastCmdValue << "s" << std::endl;
		std::cout << "  Last Cmd Power:      " << (int)LastCmdPower << "%" << std::endl;
	}
}