#pragma once
#include <cstdint>

namespace coil::protocol::commands
{
    
    /// <summary>
    /// Represents a drive command to be sent to the robot, including the direction, duration,
    /// and power of the drive action. This struct is used to serialize drive commands into the correct
    /// binary format for transmission over the network according to the packet protocol.
    /// </summary>
    // DriveCommand DTO
    // On-wire body (exactly 3 bytes, in this order):
    //   direction : uint8_t  (1..4 per protocol)
    //   duration  : uint8_t
    //   power     : uint8_t
    // The BODY_SIZE constant is defined to ensure that the body segment of the packet is always the correct size for a drive command.
	struct DriveCommand
    {
        uint8_t direction;
        uint8_t duration;
        uint8_t power;

        static constexpr std::size_t BODY_SIZE = 3;
    };
}
