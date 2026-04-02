#include "pktdef.h"
#include <cstring> 
#include <string>
#include <bit>
#include <cstdint>
#include <stdexcept>
#include <vector>
using namespace coil::protocol::constants;
namespace coil::protocol
{
	/// <summary>
	/// Constructor for PktDef class that initializes the packet header, body, CRC, and raw buffer to default values.
	/// </summary>
	PktDef::PktDef()
		: pktHeader{}, pktBody(nullptr), pktCRC(0), rawBuffer(nullptr) {
		pktHeader.packetLength = MIN_PKT_SIZE;
	}

	/// <summary>
	/// Constructor that takes a raw data buffer and its size, validates CRC before deserializing.
	/// </summary>
	/// <param name="rawData">Pointer to the raw packet data</param>
	/// <param name="bufferSize">Total size of the buffer in bytes</param>
	/// <exception cref="std::runtime_error">
	/// Thrown when CRC validation fails or header validation fails.
	/// </exception>
	PktDef::PktDef(const char* rawData, int bufferSize)
	{
		// Basic validation checks to ensure we have enough data for at least a header and CRC, and that the rawData pointer is not null.
		if (bufferSize < MIN_PKT_SIZE)throw std::invalid_argument("Buffer too small for valid packet");
		if (rawData == nullptr) throw std::invalid_argument("rawData cannot be null");

		// Variable to hold the result of memcpy_s operations
		errno_t result;

		// Initialize rawBuffer to nullptr as it isn't used until serializing a packet for transmission
		rawBuffer = nullptr;

		// Extract CRC directly from last byte
		this->pktCRC = static_cast<uint8_t>(rawData[bufferSize - 1]);

		// Validate the CRC packet here
		if (!CheckCRC(rawData, bufferSize))
		{
			// Calculate both CRCs for detailed error message
			uint8_t receivedCRC = static_cast<uint8_t>(rawData[bufferSize - 1]);
			unsigned int count = 0;

			// Count bits in header - used to compute CRC for error message
			for (int i = 0; i < bufferSize - 1; i++) {
				count += std::popcount(static_cast<unsigned char>(rawData[i]));
			}
			uint8_t computedCRC = static_cast<uint8_t>(count & 0xFF);

			// Invalidate ALL fields to prevent using corrupted data
			pktHeader = {};
			pktBody = nullptr;
			pktCRC = 0;

			std::string errorMsg = "CRC validation failed. Expected: 0x"
				+ std::to_string(computedCRC)
				+ ", Received: 0x" + std::to_string(receivedCRC);
			throw std::runtime_error(errorMsg);
		}

		// CRC passed - now deserialize the header
		result = memcpy_s(&pktHeader, HEADER_SIZE, rawData, HEADER_SIZE);

		// If the result is non-zero, it indicates a failure in copying the header data.
		if (result != 0)
		{
			char errorBuffer[256];
			strerror_s(errorBuffer, sizeof(errorBuffer), result);
			std::string errorMsg = "Failed to copy header data. Error: "
				+ std::string(errorBuffer)
				+ " (code: " + std::to_string(result) + ")";
			throw std::runtime_error(errorMsg);
		}

		/* 
			Validate buffer has enough space for claimed body length - if not this would indicate a malformed packet
		    where the header's body length field does not match the actual data provided in the buffer,
		    which could lead to buffer overruns if we attempted to copy the body data without this check.
		 */
		if (bufferSize != pktHeader.packetLength) 
		{
			throw std::invalid_argument("Buffer size mismatch: header claims body length of "
				+ std::to_string(pktHeader.packetLength)
				+ " bytes, but buffer is too small");
		}

		// Validate the header fields to ensure they represent a valid command.
		if (!ValidateHeader(pktHeader))
		{
			// Generate error BEFORE clearing
			std::string errorMsg = GetHeaderValidationError(pktHeader);

			// Invalid command combination!
			pktHeader = {};
			pktBody = nullptr;
			pktCRC = 0;

			// Throw an exception using the GetHeaderValidationError function to provide a detailed error message about why the header is invalid.
			throw std::runtime_error(errorMsg);
		}
		
		// Deserialize body if present - check if the packet is larger than MIN_PKT_SIZE, which would indicate the presence of body data based on the packet structure.
		if (bufferSize > MIN_PKT_SIZE)
		{
			// Prepare space for the body data based on the body length specified in the header
			int packetBodyLength = pktHeader.packetLength - MIN_PKT_SIZE;
			pktBody = new char[packetBodyLength];
			const char* pktBodyPtr = rawData + HEADER_SIZE;

			// Copy the data into the packet body - provide bodyLength to ensure no overrun can occur
			result = memcpy_s(
				pktBody,
				packetBodyLength,
				pktBodyPtr,
				packetBodyLength);
			
			// Check if an error occurred
			if (result != 0)
			{
				// Free any memory allocated for the body to prevent leaks before throwing the exception
				delete[] pktBody;
				pktBody = nullptr;
				throw std::runtime_error("Failed to copy body data.");
			}
		}
		else
		{
			// Bodylength is 0 - ensure pktBody is null to reflect no body data
			pktBody = nullptr;
		}
	}

	/// <summary>
	/// Destructor for PktDef class. Responsible for freeing any dynamically allocated memory
	/// for the packet body and raw buffer to prevent memory leaks.
	/// </summary>
	PktDef::~PktDef()
	{
		delete[] pktBody;     // Free body memory
		delete[] rawBuffer;   // Free raw buffer memory
	}

	/// <summary>
	/// Sets the command type of the packet based on the provided CmdType enum value.
	/// </summary>
	/// <param name="cmd"></param>
	void PktDef::SetCmd(CmdType cmd)
	{
		pktHeader.driveBit = 0;
		pktHeader.statusBit = 0;
		pktHeader.sleepBit = 0;

		// Then set the specific bit based on command type
		switch (cmd)
		{
		case CmdType::DRIVE:
			pktHeader.driveBit = 1;
			break;

		case CmdType::SLEEP:
			pktHeader.sleepBit = 1;
			break;

		case CmdType::RESPONSE:
			pktHeader.statusBit = 1;
			break;

		default:
			// Invalid command type - maybe log error
			break;
		}

		// If packet length is not set and there's no body, set it to minimum size
		if (pktHeader.packetLength == 0 && pktBody == nullptr) {
			pktHeader.packetLength = MIN_PKT_SIZE;
		}
	}

	/// <summary>
	/// Sets the acknowledgment flag in the packet header.
	/// </summary>
	/// <param name="">True to set the Ack flag, False to clear it.</param>
	void PktDef::SetAck(bool newAckValue)
	{
		bool ackValue = (pktHeader.ackBit == 1); // Get current ack value
		if (ackValue != newAckValue) // Only update if the new value is different to avoid unnecessary changes
		{
			pktHeader.ackBit = newAckValue ? 1 : 0; // Set or clear the ack bit based on the new value
		}
	}

	/// <summary>
	/// Sets the body data of the packet by taking a pointer to a RAW data buffer and its size in bytes.
	/// </summary>
	/// <param name="data"> A pointer to the body.</param>
	/// <param name="size"> Represents the size of the body.</param>
	/// <exception cref="std::runtime_error"> 
	/// Thrown when copying body data fails (invalid parameters or buffer overrun).
	/// </exception>
	void PktDef::SetBodyData(char* data, int size)
	{
		// Validate the size to ensure it is within the allowed limits for the packet body.
		if (size < 0 || size > MAX_BODY_SIZE) throw std::invalid_argument("size must be between 0 and 250");
		
		// Validate the incomming arguments to ensure we don't have a null pointer with a non-zero size
		if (data == nullptr && size > 0) throw std::invalid_argument("data cannot be null when size > 0");

		// First, we should free any existing body data to prevent memory leaks
		delete[] pktBody;

		// Handle zero-size case properly
		if (size == 0) {
			pktBody = nullptr;
			pktHeader.packetLength = MIN_PKT_SIZE;
			return;
		}

		// Allocate new memory for the body and copy the data
		pktBody = new char[size];

		// Move the data into the location pointed to by pktBody pointer - provide size to ensure no overrun can occur
		errno_t result = memcpy_s(pktBody, size, data, size);

		// If the result is non-zero, it indicates a failure in copying the header data.
		if (result != 0)
		{
			delete[] pktBody; // Free any memory allocated for the body to prevent leaks before throwing the exception
			pktBody = nullptr;
			pktHeader.packetLength = MIN_PKT_SIZE;
			char errorBuffer[256];
			strerror_s(errorBuffer, sizeof(errorBuffer), result);
			std::string errorMsg = "Failed to copy body data. Error: "
				+ std::string(errorBuffer)
				+ " (code: " + std::to_string(result) + ")";
			throw std::runtime_error(errorMsg);
		}

		// packetLength = Header(4) + Body(N) + CRC(1)
		pktHeader.packetLength = static_cast<uint8_t>(size + MIN_PKT_SIZE);

	}

	// Sets the packet count in the header 
	bool PktDef::SetPktCount(int count)
	{
		// Max value for uint16_t is 2^16 - 1 = 65535
		constexpr int maxCount = 65535;

		// Check if the count is within the valid range for uint16_t
		if (count < 0 || count > maxCount) return false;

		// Don't forget to cast it to uint16_t since pktCount is defined as uint16_t in the Header struct
		pktHeader.pktCount = static_cast<uint16_t>(count);
		return true;
	}

	/// @brief Gets command type stored in a packet of the provided CmdType enum value
	/// @return CmdType on success, 0 if invalid command
	CmdType PktDef::GetCmd() const
	{
		const int drive = pktHeader.driveBit; // these are mainly for human readability
		const int status = pktHeader.statusBit;
		const int sleep = pktHeader.sleepBit;

		if (drive == 1 && status == 0 && sleep == 0)
			return CmdType::DRIVE;
		else if (drive == 0 && status == 1 && sleep == 0)
			return CmdType::RESPONSE;
		else if (drive == 0 && status == 0 && sleep == 1)
			return CmdType::SLEEP;
		else {
			// invalid command type - log error
			// error types:
			// - no command (ex. 0,0,0)
			// - multiple commands (ex. 1,1,0)

			return CmdType::UNKNOWN; // Invalid Command
		}

	}

	/// @brief query function that verifies whether or not the command recieved from the robot has been acknowledged 
	/// @return True if ackBit==1; otherwise False
	bool PktDef::GetAck() const
	{
		// verify that robot response ackBit = 1
		if (pktHeader.ackBit == 1)
			return true;
		return false; // anything other than 1 is false
	}

	// Gets the length of the entire packet
	int PktDef::GetLength() const
	{
		return pktHeader.packetLength;
	}

	// Gets a pointer to the body data
	char* PktDef::GetBodyData()
	{
		return pktBody;
	}

	// Gets the packet count value
	int PktDef::GetPktCount() const
	{
		return pktHeader.pktCount;
	}

	// Checks packet integrity using CRC
	bool PktDef::CheckCRC(const char* rawDat, int sizeBuff)
	{	// Note:
		// sizeBuff is the Size in Bytes of the rawData
		// - essentially it is the length in bytes of the entire packet
		// - !Based on this, the last Byte in this data should be the CRC
		if (rawDat == nullptr || sizeBuff < constants::MIN_PKT_SIZE) return false;

		int bitCount = 0;
		//count bits in everything EXCEPT the last byte
		for (int i = 0; i < sizeBuff - 1; i++) 
		{
			bitCount += std::popcount(static_cast<uint8_t>(rawDat[i]));
		}

		uint8_t recievedCRC = static_cast<uint8_t>(rawDat[sizeBuff - 1]);
		uint8_t computedCRC = static_cast<uint8_t>(bitCount & 0xFF);

		return (computedCRC == recievedCRC);

	}

	// Calculates and stores the CRC value
	void PktDef::CalcCRC()
	{
		// Ensure packet length is set if not already
		if (pktHeader.packetLength == 0 && pktBody == nullptr) {
			pktHeader.packetLength = MIN_PKT_SIZE;
		}

		// count every BIT set to '1' in header & body
		int bitCount = 0;

		//1. Count bits in entire 4-byte Header (includes PktCount, Flags, Padding and length)
		const uint8_t* headerPtr = reinterpret_cast<const uint8_t*>(&pktHeader);
		for (size_t i = 0; i < constants::HEADER_SIZE; i++)
		{
			bitCount += std::popcount(headerPtr[i]);
		}

		//2. Count bits in the body
		if (pktBody != nullptr && pktHeader.packetLength > constants::MIN_PKT_SIZE)
		{
			int bodySize = pktHeader.packetLength - constants::MIN_PKT_SIZE;
			for (int i = 0; i < bodySize; i++)
			{
				bitCount += std::popcount(static_cast<uint8_t>(pktBody[i]));
			}

		}

		//3. store the result

		pktCRC = static_cast<uint8_t>(bitCount & 0xFF);

	}

	/// <summary>
	/// Generates a raw data packet for transmission by allocating the RawBuffer and transferring
	/// the contents from the object's member variables into it. The returned pointer is owned by
	/// this object and must NOT be deleted by the caller. The pointer is const to prevent modification.
	/// </summary>
	/// <returns>Const pointer to internal RawBuffer containing the serialized packet data</returns>
	/// <exception cref="std::runtime_error">
	/// Thrown when copying header data fails (invalid parameters or buffer overrun).
	/// </exception>
	/// <exception cref="std::runtime_error">
	/// Thrown when copying body data fails (invalid parameters or buffer overrun).
	/// </exception>
	const char* PktDef::GenPacket()
	{
		// An error result of 0 indicates success for memcpy_s, any non-zero value indicates a failure.
		errno_t result;

		// Free the previous rawBuffer if it exists to prevent memory leaks before allocating a new buffer
		delete[] rawBuffer;

		// Use packetLength from header, or MIN_PKT_SIZE if it's not set
		uint8_t actualPacketLength = (pktHeader.packetLength == 0) ? MIN_PKT_SIZE : pktHeader.packetLength;

		int packetBodyLength = actualPacketLength - MIN_PKT_SIZE; // Calculate body length based on total packet length minus header and CRC size

		// Allocate a buffer to hold the entire packet
		rawBuffer = new char[actualPacketLength];

		// Create a copy of the header with the correct packet length
		Header headerCopy = pktHeader;
		headerCopy.packetLength = actualPacketLength;

		// Pointer to keep track of where we are (which element) in the buffer
		char* writePtr = rawBuffer; 

		// Copy the header into the buffer - provide packet size to ensure no overrun can occur.
		result = memcpy_s(writePtr, actualPacketLength, &headerCopy, HEADER_SIZE);

		//If the result is non-zero, indicates a failure in copying the header data
		if (result != 0)
		{
			char errorBuffer[256];
			strerror_s(errorBuffer, sizeof(errorBuffer), result);
			std::string errorMsg = "Failed to copy header data. Error: "
				+ std::string(errorBuffer)
				+ " (code: " + std::to_string(result) + ")";
			throw std::runtime_error(errorMsg);
		}

		// Move pointer past header
		writePtr += HEADER_SIZE; 

		// Check if the packet has a body, and if so copy the body data into the buffer - provide remaining buffer size to ensure no overrun can occur.
		if (pktBody != nullptr && actualPacketLength > MIN_PKT_SIZE)
		{	
			uint8_t remainingSize = actualPacketLength - HEADER_SIZE;
			result = memcpy_s(writePtr, remainingSize, pktBody, packetBodyLength);
			if (result != 0)
			{
				char errorBuffer[256];
				strerror_s(errorBuffer, sizeof(errorBuffer), result);
				std::string errorMsg = "Failed to copy body data. Error: "
					+ std::string(errorBuffer)
					+ " (code: " + std::to_string(result) + ")";
				throw std::runtime_error(errorMsg);
			}

			// Advance the pointer past the body
			writePtr += packetBodyLength;

		}

		//3. Place CRC at the last byte
		*writePtr = pktCRC;

		return rawBuffer;  // Return const pointer to internal buffer
	}

	// Private helper method (add declaration to pktdef.hpp)
	bool PktDef::ValidateHeader(Header header)
	{
		// Count primary command bits (must be exactly 1)
		int cmdCount = header.driveBit + header.statusBit + header.sleepBit;

		int packetBodyLength = header.packetLength - MIN_PKT_SIZE;

		// Exactly ONE primary command must be set
		if (cmdCount != 1) {
			return false;  // Invalid: multiple or no primary commands
		}

		// If we get here, exactly one primary command is set

		// Check if DRIVE command has a body - it should have one, so if driveBit is set and body length is 0, it's invalid
		if (header.driveBit && packetBodyLength == 0) return false;

		// Check if SLEEP command has a body - it should NOT have one, so if sleepBit is set and body length is greater than 0, it's invalid
		if (header.sleepBit && packetBodyLength > 0) return false;

		return true;  // Valid combination
	}

	/// <summary>
	/// Gets the validation error message for a header.
	/// </summary>
	/// <param name="header">The header to validate.</param>
	/// <returns>A string containing the validation error message, or an empty string if the header is valid.</returns>
	std::string PktDef::GetHeaderValidationError(const Header& header)
	{
		int cmdCount = header.driveBit + header.statusBit + header.sleepBit;

		int packetBodyLength = header.packetLength - MIN_PKT_SIZE;

		std::string errorMsg = "Header validation failed: ";

		if (cmdCount == 0) {
			errorMsg += "No command bits set (expected exactly one).";
		}
		else if (cmdCount > 1) {
			errorMsg += "Multiple command bits set (expected exactly one). ";
			errorMsg += "Drive=" + std::to_string(header.driveBit)
				+ ", Status=" + std::to_string(header.statusBit)
				+ ", Sleep=" + std::to_string(header.sleepBit);
		}
		else if (header.driveBit && packetBodyLength == 0) {
			errorMsg += "DRIVE command requires body data, but bodyLength is 0.";
		}
		else if (header.sleepBit && packetBodyLength > 0) {
			errorMsg += "SLEEP command should not have body data, but bodyLength is "
				+ std::to_string(packetBodyLength) + ".";
		}
		else {
			errorMsg += "Unknown validation error.";
		}

		return errorMsg;
	}


}
