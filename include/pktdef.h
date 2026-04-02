#pragma once
#include "types.h"
#include "constants.h"
#include <string>

namespace coil::protocol
{
	class PktDef {
	private:
	
		Header pktHeader; // 4 bytes
		char* pktBody; // Variable length body data
		uint8_t pktCRC; // 1 byte for CRC value

		char* rawBuffer; // Buffer to hold the generated raw packet data for transmission

		struct CmdPacket
		{
			Header header;
			char* body;
			uint8_t crc;
		};

		// A method used to validate the header portion of an incoming packet.
		static bool ValidateHeader(Header header);


	public:
		PktDef();
		PktDef(const char*, int);
		~PktDef();  // Destructor

		// Delete copy constructor and copy assignment operator to prevent copying of PktDef objects,
		// which could lead to issues with memory management due to the raw pointers used for body data and raw buffer.
		PktDef(const PktDef&) = delete;
		PktDef& operator=(const PktDef&) = delete;

		// Delete move constructor and move assignment operator to prevent moving of PktDef objects as well.
		PktDef& operator=(PktDef&&) = delete;
		PktDef(PktDef&&) = delete;		

		/// <summary>
		/// Sets the command type of the packet based on the provided CmdType enum value.
		/// This function will update the appropriate command flag bit in the packet header to reflect the specified command type.
		/// </summary>
		/// <param name=""></param>
		void SetCmd(CmdType);

		/// <summary>
		/// Sets the body data of the packet by taking a pointer to a RAW data buffer and its size in bytes.
		/// </summary>
		/// <param name=""></param>
		/// <param name=""></param>
		void SetBodyData(char*, int);

		/// <summary>
		/// Sets the packet count in the header of the packet to the specified integer value.
		/// This function updates the PktCount field in the packet header to reflect the provided count, which is used for tracking and sequencing packets in communication.
		/// </summary>
		/// <param name=""></param>
		bool SetPktCount(int);

		/// <summary>
		/// Gets the command type of the packet by examining the command flag bits in the packet header and returning the corresponding CmdType enum value.
		/// </summary>
		/// <returns></returns>
		CmdType GetCmd() const;

		/// <summary>
		/// Gets the acknowledgment status of the packet by checking
		/// the Ack flag in the packet header and returning True if the flag is set, or False if it is not set.
		/// </summary>
		/// <returns></returns>
		bool GetAck() const;

		/// <summary>
		/// Gets the length of the packet in bytes by returning the value of the Length
		/// field in the packet header, which indicates the size of the packet's body data.
		/// </summary>
		/// <returns></returns>
		int GetLength() const;

		/// <summary>
		/// Sets the acknowledgment flag in the packet header.
		/// </summary>
		/// <param name="">True to set the Ack flag, False to clear it.</param>
		void SetAck(bool);

		/// <summary>
		/// Gets a pointer to the body data of the packet by returning the address of
		/// the packet's Body field, which contains the raw data payload of the packet.
		/// </summary>
		/// <returns></returns>
		char* GetBodyData();

		/// <summary>
		/// Get the packet count value from the packet header by returning the value of
		/// the PktCount field, which is used for tracking and sequencing packets in communication.
		/// </summary>
		/// <returns></returns>
		int GetPktCount() const;

		/// <summary>
		/// Check the integrity of the packet by calculating the CRC of the provided RAW data buffer
		/// and comparing it to the CRC value stored in the packet.
		/// </summary>
		/// <returns></returns>
		bool CheckCRC(const char*, int);

		/// <summary>
		/// Calculates the CRC (Cyclic Redundancy Check) for the packet by processing the
		/// packet's header and body data to generate a CRC value, which is then stored in the
		/// packet's CRC field for error detection during transmission.
		/// </summary>
		void CalcCRC();

		/// <summary>
		/// Generates a raw data packet for transmission by allocating the RawBuffer and transferring
		/// the contents from the object's member variables into it.
		/// **WARNING: Do NOT delete the returned pointer - it is owned by this object**
		/// **WARNING: Do NOT modify the returned data - it is const for safety**
		/// **WARNING: Pointer is only valid until next GenPacket() call or object destruction**
		/// </summary>
		/// <returns>Const pointer to internal RawBuffer (do not delete or modify)</returns>
		const char* GenPacket();

		/// <summary>
		/// Gets the validation error message for a header.
		/// </summary>
		/// <param name="header">The header to validate.</param>
		/// <returns>A string containing the validation error message, or an empty string if the header is valid.</returns>
		static std::string GetHeaderValidationError(const Header& header);		
	};
}