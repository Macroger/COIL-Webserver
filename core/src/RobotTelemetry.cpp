#include "types.h"
#include <iostream>
#include <stdexcept>

namespace coil::protocol
{
	RobotTelemetry RobotTelemetry::Deserialize(const unsigned char* data, size_t length)
	{
		// Wire layout (little-endian uint16s, indices 8-9 are unused/reserved by simulator):
		//   [0-1]  LastPktCounter
		//   [2-3]  CurrentGrade
		//   [4-5]  HitCount
		//   [6-7]  Heading
		//   [8-9]  (reserved - not used)
		//   [10]   LastCmd
		//   [11]   LastCmdValue
		//   [12]   LastCmdPower
		if (length < 13) {
			throw std::invalid_argument("Telemetry data too short - expected at least 13 bytes, got " + std::to_string(length));
		}

		RobotTelemetry telemetry;

		// Simulator sends little-endian (LSB first)
		telemetry.LastPktCounter = (data[1] << 8) | data[0];
		telemetry.CurrentGrade   = (data[3] << 8) | data[2];
		telemetry.HitCount       = (data[5] << 8) | data[4];
		telemetry.Heading        = (data[7] << 8) | data[6];
		// data[8] and data[9] are reserved - skip

		telemetry.LastCmd      = data[10];
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