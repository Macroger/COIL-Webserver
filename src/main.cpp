#define CROW_MAIN

#include <crow.h>
#include <map>
#include <iostream>
#include <filesystem>
#include <fstream>
#include <regex>
#include <ctime>
#include <memory>
#include <mutex>
#include <csignal>
#include <cstdlib>
#include <atomic>
#include "MySocket.h"
#include "pktdef.h"
// httplib must come after MySocket.h — httplib defines INVALID_SOCKET as a macro
// on non-Windows platforms, which conflicts with MySocket's constexpr of the same name.
#include <httplib.h>

using namespace std;

// Signal handler to restore terminal state and exit cleanly
static void restore_and_exit_handler(int sig)
{
	::system("stty sane > /dev/null 2>&1");
	std::exit(128 + sig);
}

int main()
{
	crow::SimpleApp app;
	// Restore terminal state on SIGINT/SIGTERM to avoid leaving the
	// user's tty in a weird state if the server is interrupted.
	std::signal(SIGINT, restore_and_exit_handler);
	std::signal(SIGTERM, restore_and_exit_handler);
    
	// Shared socket manager, mutex, and packet counter for thread-safe use in route handlers
	std::shared_ptr<coil::protocol::MySocket> socketMgr;
	std::mutex socketMutex;
	int pktCounter = 0;

	// Relay mode state — when active, commands are forwarded via HTTP to a downstream server (PC3)
	// instead of being sent as raw robot protocol packets directly to the robot.
	bool relayMode = false;
	std::string relayHost;
	int relayPort = 30333;

	// Command and Control GUI for robot - serves the main page of the web interface
	CROW_ROUTE(app, "/")
	([](const crow::request& req, crow::response& res)
	{
		ifstream file("public/index.html", ifstream::in);
		if(file)
		{
			ostringstream fileContents;
			fileContents << file.rdbuf();
			file.close();
			res.code = 200;
			res.set_header("Content-Type", "text/html");
			res.write(fileContents.str());
		}
		else
		{
			res.code = 404;
			res.set_header("Content-Type", "text/plain");
			res.write("Page Not Found");
		}
		res.end();
	});

	// Generic page route - this will attempt to serve any file in the public directory, and if it doesn't exist, will return a 404.
	CROW_ROUTE(app, "/page/<string>")
	([](crow::request& req, crow::response& res, std::string name)
	{
		ifstream file("public/" + name, ifstream::in);
		if(file)
		{
			ostringstream fileContents;
			fileContents << file.rdbuf();
			file.close();
			res.code = 200;
			res.set_header("Content-Type", "text/html");			
			res.write(fileContents.str());
		}
		else
		{
			res.code = 404;
			res.set_header("Content-Type", "text/plain");
			res.write("Page Not Found");
		}

		// Check if sending the checkout page - if so, send a 401 response along with the page.
		if(name == "checkout.html") res.code = 401;
		
		res.end();
	});	

	// Get javascript files
	CROW_ROUTE(app, "/get_script/<string>")
	([](crow::request& req, crow::response& res, std::string name)
	{
		// Validate the file name - anything less than 4 chars doesn't have a valid name (x.js).
		if(name.length() < 4)
		{
			// Respond with a small error message indicating the issue.
			res.write("Bad script file name requested. Valid format: \"x.js\"");

			// If the file does not exist, adjust the response code to the appropriate error (400 - Bad request).
			res.code = 400;

			// Write the response back to the client.
			res.end();

			// Exit - no further actions to be taken.
			return;
		}

		// Attempt to open the requested file in the Styles folder
		ifstream file("public/scripts/" + name, ifstream::ios_base::binary);
		
		// If the file exists, read its contents and send it in the response
		if(file)
		{
			// Create an output string stream to hold the file contents
			ostringstream fileContents;

			// Read the entire contents of the file into the string stream
			fileContents << file.rdbuf();

			// Close the file stream
			file.close();

			// Write the contents of the file to the response
			res.write(fileContents.str());

			// Set the Content-Type header to indicate that this is a png image file
			res.set_header("Content-Type", "text/javascript");

			// Set the response code to 200 (OK) - just to be explicit, as the default is 200
			res.code = 200;
		}
		else
		{
			// Respond with a small error message indicating the issue.
			res.write("Javascript file: " + name + " Not Found");

			// If the file does not exist, adjust the response code to the appropriate error (404)
			res.code = 404;
		}

		// Write the response back to the client
		res.end();		
	});

	// Get images
	CROW_ROUTE(app, "/get_image/<string>")
	([](crow::request& req, crow::response& res, std::string name)
	{
		// Validate the file name - anything less than 5 chars doesn't have a valid name (x.png).
		if((name.substr(name.size() - 4) == ".png" || name.substr(name.size() - 4) == ".jpg" || name.substr(name.size() - 4) == ".jpeg") && name.length() > 5)
		{
			// Attempt to open the requested file in the Styles folder
				ifstream file("public/images/" + name, ifstream::ios_base::binary);
			
			// If the file exists, read its contents and send it in the response
			if(file)
			{
				// Create an output string stream to hold the file contents
				ostringstream fileContents;

				// Read the entire contents of the file into the string stream
				fileContents << file.rdbuf();

				// Close the file stream
				file.close();

				// Write the contents of the file to the response
				res.write(fileContents.str());

				// Set the Content-Type header to indicate that this is a png image file
				res.set_header("Content-Type", "image/png");

				// Set the response code to 200 (OK) - just to be explicit, as the default is 200
				res.code = 200;
			}
			else
			{
				// Respond with a small error message indicating the issue.
				res.write("Image file: " + name + " Not Found");

				// If the file does not exist, adjust the response code to the appropriate error (404)
				res.code = 404;
			}
		}
		else
		{
			// Respond with a small error message indicating the issue.
			res.write("Bad image file name requested. Valid format: \"x.png\", \"x.jpg\", or \"x.jpeg\"");

			// If the file does not exist, adjust the response code to the appropriate error (400 - Bad request).
			res.code = 400;
		}

		// Write the response back to the client
		res.end();		
	});

	// Get css style sheets
	CROW_ROUTE(app, "/get_style/<string>")
	([](crow::request& req, crow::response& res, std::string name)
	{
		// Ensure the extension is correct.
		
		// Check if the size is less than 5 - since the .css should consist of 4 chars any less than 5 total is an issue.
		// Or if it doesn't end in ".css".
		if(name.size() < 5 || name.substr(name.size() - 4) != ".css")
		{
			// Respond with a small error message indicating the issue.
			res.write("Bad Css file name requested. Valid format: \"x.css\"");

			// If the file does not exist, adjust the response code to the appropriate error (400 - Bad request).
			res.code = 400;

			// Write the response back to the client.
			res.end();

			// Exit - no further actions to be taken.
			return;
		}

		// Attempt to open the requested file in the Styles folder
		ifstream file("public/styles/" + name, ifstream::in);
		
		// If the file exists, read its contents and send it in the response
		if(file)
		{
			// Create an output string stream to hold the file contents
			ostringstream fileContents;

			// Read the entire contents of the file into the string stream
			fileContents << file.rdbuf();

			// Close the file stream
			file.close();

			// Write the contents of the file to the response
			res.write(fileContents.str());

			// Set the Content-Type header to indicate that this is a CSS file
			res.set_header("Content-Type", "text/css; charset=utf-8");

			// Set the response code to 200 (OK) - just to be explicit, as the default is 200
			res.code = 200;
		}
		else
		{
			// Respond with a small error message indicating the issue.
			res.write("Style sheet: " + name + " Not Found");

			// If the file does not exist, adjust the response code to the appropriate error (404)
			res.code = 404;
		}

		// Write the response back to the client
		res.end();
	});	

	// PUT /robot/telecommand - Build and send a real packet, return simulator response
	// Expected JSON: { "command": "DRIVE"|"SLEEP"|"STATUS", "direction": "FORWARD"|"BACKWARD"|"LEFT"|"RIGHT", "duration": <int>, "power": <int> }
	CROW_ROUTE(app, "/robot/telecommand").methods("PUT"_method)
	([&socketMgr, &socketMutex, &pktCounter, &relayMode, &relayHost, &relayPort](const crow::request& req, crow::response& res)
	{
		// Relay mode: forward the request as-is to the downstream server (PC3)
		if (relayMode)
		{
			httplib::Client cli(relayHost, relayPort);
			cli.set_connection_timeout(10);
			auto r = cli.Put("/robot/telecommand", req.body, "application/json");
			if (r)
			{
				res.code = r->status;
				res.set_header("Content-Type", "application/json");
				res.write(r->body);
			}
			else
			{
				res.code = 503;
				res.set_header("Content-Type", "application/json");
				res.write(R"({"status":"error","message":"Relay server unreachable"})");
			}
			res.end();
			return;
		}

		auto body = crow::json::load(req.body);

		if (!body)
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Invalid JSON"})");
			res.end();
			return;
		}

		std::lock_guard<std::mutex> lock(socketMutex);

		if (!socketMgr || !socketMgr->IsConnected())
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Not connected to robot"})");
			res.end();
			return;
		}

		try
		{
			std::string command = body["command"].s();

			coil::protocol::PktDef pkt;
			pkt.SetPktCount(++pktCounter);

			if (command == "DRIVE")
			{
				std::string direction = body["direction"].s();
				uint8_t duration     = static_cast<uint8_t>(body["duration"].d());
				uint8_t power        = static_cast<uint8_t>(body["power"].d());

				uint8_t dir = coil::protocol::constants::FORWARD;
				if      (direction == "BACKWARD") dir = coil::protocol::constants::BACKWARD;
				else if (direction == "LEFT")     dir = coil::protocol::constants::LEFT;
				else if (direction == "RIGHT")    dir = coil::protocol::constants::RIGHT;

				pkt.SetCmd(coil::protocol::CmdType::DRIVE);

				if (dir == coil::protocol::constants::LEFT || dir == coil::protocol::constants::RIGHT)
				{
					// TurnBody: Direction (1-byte) + Duration (2-bytes) — no Power field
					unsigned char turnData[3] = { dir,
					                              static_cast<uint8_t>(duration & 0xFF),
					                              static_cast<uint8_t>((duration >> 8) & 0xFF) };
					pkt.SetBodyData(reinterpret_cast<char*>(turnData), 3);
				}
				else
				{
					// DriveBody: Direction (1-byte) + Duration (1-byte) + Power (1-byte)
					unsigned char driveData[3] = { dir, duration, power };
					pkt.SetBodyData(reinterpret_cast<char*>(driveData), 3);
				}
			}
			else if (command == "SLEEP")
			{
				pkt.SetCmd(coil::protocol::CmdType::SLEEP);
			}
			else if (command == "STATUS")
			{
				pkt.SetCmd(coil::protocol::CmdType::RESPONSE);
			}
			else
			{
				res.code = 400;
				res.set_header("Content-Type", "application/json");
				res.write(R"({"status":"error","message":"Unknown command. Use DRIVE, SLEEP, or STATUS"})");
				res.end();
				return;
			}

			socketMgr->SendData(pkt.GenPacket(), pkt.GetLength());

			// Read simulator response
			char recvBuf[coil::protocol::constants::MAX_PKT_SIZE] = {0};
			int bytesRead = socketMgr->GetData(recvBuf);

			auto response = crow::json::wvalue();
			response["status"]       = "success";
			response["command"]      = command;
			response["packet_count"] = pktCounter;
			response["timestamp"]    = static_cast<long long>(std::time(nullptr));

			if (bytesRead > 0)
			{
				coil::protocol::PktDef responsePkt(recvBuf, bytesRead);
				bool ack = responsePkt.GetAck();
				response["ack"]          = ack;
				response["sim_response"] = ack ? "ACK" : "NACK";

				// Capture any text message in the response body
				char* bodyPtr = responsePkt.GetBodyData();
				int   bodyLen = responsePkt.GetLength() - coil::protocol::constants::MIN_PKT_SIZE;
				if (bodyPtr != nullptr && bodyLen > 0)
				{
					response["sim_message"] = std::string(bodyPtr, bodyLen);
				}
			}
			else
			{
				response["ack"]          = false;
				response["sim_response"] = "TIMEOUT";
				response["sim_message"]  = "No response from simulator";
			}

			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		catch (const std::exception& e)
		{
			res.code = 500;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":")" + std::string(e.what()) + R"("})");
		}

		res.end();
	});

	// Helper lambda: build and send a DRIVE packet, return simulator response as JSON wvalue
	auto sendDrivePacket = [&socketMgr, &socketMutex, &pktCounter](
		uint8_t dir, uint8_t duration, uint8_t power,
		crow::response& res) -> bool
	{
		std::lock_guard<std::mutex> lock(socketMutex);

		if (!socketMgr || !socketMgr->IsConnected())
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Not connected to robot"})");
			res.end();
			return false;
		}

		try
		{
			coil::protocol::PktDef pkt;
			pkt.SetPktCount(++pktCounter);
			pkt.SetCmd(coil::protocol::CmdType::DRIVE);
			unsigned char driveData[3] = { dir, duration, power };
			pkt.SetBodyData(reinterpret_cast<char*>(driveData), 3);
			socketMgr->SendData(pkt.GenPacket(), pkt.GetLength());

			char recvBuf[coil::protocol::constants::MAX_PKT_SIZE] = {0};
			int bytesRead = socketMgr->GetData(recvBuf);

			auto response = crow::json::wvalue();
			response["status"]       = "success";
			response["packet_count"] = pktCounter;
			response["timestamp"]    = static_cast<long long>(std::time(nullptr));

			if (bytesRead > 0)
			{
				coil::protocol::PktDef responsePkt(recvBuf, bytesRead);
				bool ack = responsePkt.GetAck();
				response["ack"]          = ack;
				response["sim_response"] = ack ? "ACK" : "NACK";

				char* bodyPtr = responsePkt.GetBodyData();
				int   bodyLen = responsePkt.GetLength() - coil::protocol::constants::MIN_PKT_SIZE;
				if (bodyPtr != nullptr && bodyLen > 0)
					response["sim_message"] = std::string(bodyPtr, bodyLen);
			}
			else
			{
				response["ack"]          = false;
				response["sim_response"] = "TIMEOUT";
				response["sim_message"]  = "No response from simulator";
			}

			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		catch (const std::exception& e)
		{
			res.code = 500;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":")" + std::string(e.what()) + R"("})");
		}

		res.end();
		return true;
	};	

	// POST /robot/connect - Configure and connect to robot or relay server
	CROW_ROUTE(app, "/robot/connect/<string>/<int>/<string>").methods("POST"_method)
	([&socketMgr, &socketMutex, &relayMode, &relayHost, &relayPort](const crow::request& req, crow::response& res, std::string ip, int port, std::string modeStr)
	{
		// Relay mode: store PC3 address, verify it is reachable, skip socket setup
		if (modeStr == "relay")
		{
			httplib::Client cli(ip, port);
			cli.set_connection_timeout(5);
			auto r = cli.Get("/robot/check-connection");

			auto response = crow::json::wvalue();
			if (r && r->status == 200)
			{
				std::lock_guard<std::mutex> lock(socketMutex);
				relayMode = true;
				relayHost = ip;
				relayPort = port;
				socketMgr = nullptr;

				response["status"]    = "success";
				response["message"]   = "Relay connected to " + ip + ":" + std::to_string(port);
				response["ip"]        = ip;
				response["port"]      = port;
				response["mode"]      = 2;
				response["timestamp"] = static_cast<long long>(std::time(nullptr));
				res.code = 200;
			}
			else
			{
				response["status"]  = "error";
				response["message"] = "Cannot reach relay server at " + ip + ":" + std::to_string(port);
				res.code = 500;
			}
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
			res.end();
			return;
		}

		// Direct mode (TCP or UDP): open a socket to the robot/simulator
		int mode = (modeStr == "udp") ? 1 : 0;
		uint bufferSize = coil::protocol::constants::DEFAULT_SIZE;

		std::lock_guard<std::mutex> lock(socketMutex);
		relayMode = false;

		try
		{
			auto connType = static_cast<coil::protocol::ConnectionType>(mode);

			socketMgr = std::make_shared<coil::protocol::MySocket>(
				coil::protocol::SocketType::CLIENT,
				connType,
				port,
				bufferSize,
				ip
			);

			if (connType == coil::protocol::ConnectionType::TCP)
				socketMgr->ConnectTCP();

			auto response = crow::json::wvalue();
			response["status"]    = "success";
			response["message"]   = "Connected to robot";
			response["ip"]        = ip;
			response["port"]      = port;
			response["mode"]      = mode;
			response["timestamp"] = static_cast<long long>(std::time(nullptr));

			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		catch(const std::exception& e)
		{
			res.code = 500;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Failed to connect to robot: )" + std::string(e.what()) + R"("})");
			res.end();
			return;
		}

		res.end();
	});

	// POST /robot/disconnect - Disconnect from robot
	CROW_ROUTE(app, "/robot/disconnect").methods("POST"_method)
	([&socketMgr, &socketMutex, &pktCounter, &relayMode, &relayHost, &relayPort](const crow::request& req, crow::response& res)
	{
		// Relay mode: forward disconnect to PC3 then clear relay state
		if (relayMode)
		{
			httplib::Client cli(relayHost, relayPort);
			cli.set_connection_timeout(10);
			auto r = cli.Post("/robot/disconnect", "", "application/json");

			relayMode = false;

			if (r)
			{
				res.code = r->status;
				res.set_header("Content-Type", "application/json");
				res.write(r->body);
			}
			else
			{
				res.code = 200;
				res.set_header("Content-Type", "application/json");
				res.write(R"json({"status":"success","message":"Relay disconnected (no response from server)"})json");
			}
			res.end();
			return;
		}

		auto response = crow::json::wvalue();
		response["status"] = "success";
		response["message"] = "Disconnected from robot";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));

		try
		{
			std::lock_guard<std::mutex> lock(socketMutex);
			if (socketMgr) 
			{
				// Send a SLEEP packet before disconnecting so the robot enters sleep mode cleanly
				coil::protocol::PktDef sleepPkt;
				sleepPkt.SetPktCount(++pktCounter);
				sleepPkt.SetCmd(coil::protocol::CmdType::SLEEP);
				socketMgr->SendData(sleepPkt.GenPacket(), sleepPkt.GetLength());

				// Wait for the robot's acknowledgement of the SLEEP command
				char recvBuf[coil::protocol::constants::MAX_PKT_SIZE] = {0};
				int sleepBytes = socketMgr->GetData(recvBuf);

				// Parse the ACK and surface it in the response so the frontend can log it
				if (sleepBytes > 0)
				{
					coil::protocol::PktDef sleepResp(recvBuf, sleepBytes);
					bool sleepAck = sleepResp.GetAck();
					response["sleep_ack"]      = sleepAck;
					response["sleep_response"] = sleepAck ? "ACK" : "NACK";
					response["sleep_pkt_count"] = pktCounter;
				}
				else
				{
					response["sleep_ack"]      = false;
					response["sleep_response"] = "TIMEOUT";
					response["sleep_pkt_count"] = pktCounter;
				}

				socketMgr->DisconnectTCP();
			}
			else 
			{
				response["status"] = "error";
				response["message"] = "No active connection to disconnect";
			}
		}
		catch(const std::exception& e)
		{
			res.code = 500;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Failed to disconnect from robot: )" + std::string(e.what()) + R"("})");
			res.end();
			return;
		}
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	// GET /robot/check-connection - Check current connection status
	CROW_ROUTE(app, "/robot/check-connection").methods("GET"_method)
	([&socketMgr, &socketMutex, &relayMode, &relayHost, &relayPort](crow::request& req, crow::response& res)
	{
		auto response = crow::json::wvalue();

		if (relayMode)
		{
			// In relay mode we're "connected" if PC3 is reachable and connected
			httplib::Client cli(relayHost, relayPort);
			cli.set_connection_timeout(3);
			auto r = cli.Get("/robot/check-connection");
			response["connected"] = (r && r->status == 200);
			response["relay"]     = true;
			response["relay_host"] = relayHost;
			response["relay_port"] = relayPort;
		}
		else
		{
			response["connected"] = (socketMgr ? socketMgr->IsConnected() : false);
			response["relay"]     = false;
		}
		response["status"] = "active";
		response["message"] = "Connection is active";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	// GET /robot/telemetry - Request robot status/telemetry
	CROW_ROUTE(app, "/robot/telemetry_request").methods("GET"_method)
	([&socketMgr, &socketMutex, &relayMode, &relayHost, &relayPort](crow::request& req, crow::response& res)
	{
		// Relay mode: forward telemetry request to PC3
		if (relayMode)
		{
			httplib::Client cli(relayHost, relayPort);
			cli.set_connection_timeout(10);
			auto r = cli.Get("/robot/telemetry_request");
			if (r)
			{
				res.code = r->status;
				res.set_header("Content-Type", "application/json");
				res.write(r->body);
			}
			else
			{
				res.code = 503;
				res.set_header("Content-Type", "application/json");
				res.write(R"({"status":"error","message":"Relay server unreachable"})");
			}
			res.end();
			return;
		}

		auto response = crow::json::wvalue();
		coil::protocol::RobotTelemetry telemetryPkt;

		try
		{
			std::lock_guard<std::mutex> lock(socketMutex);
			if (socketMgr)
			{
				telemetryPkt = socketMgr->GetTelemetry();
			}
			else
			{
				response["status"] = "error";
				response["message"] = "No active connection to get telemetry from robot";
				res.code = 400;
				res.set_header("Content-Type", "application/json");
				res.write(response.dump());
				res.end();
				return;
			}

			// If we successfully got telemetry, populate the response with it
				response["telemetry"] = {
					{"last_packet_counter", telemetryPkt.LastPktCounter},
					{"current_grade", telemetryPkt.CurrentGrade},
					{"hit_count", telemetryPkt.HitCount},
					{"heading", telemetryPkt.Heading},
					{"last_command", telemetryPkt.LastCmd},
					{"last_command_value", telemetryPkt.LastCmdValue},
					{"last_command_power", telemetryPkt.LastCmdPower}
				};
		}
		catch(const std::exception& e)
		{
			cout << "Error getting telemetry: " << e.what() << endl;
			res.code = 500;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Failed to get telemetry from robot: )" + std::string(e.what()) + R"("})");
			res.end();
			return;
		}
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	// GET /robot/status - Check robot connection status
	CROW_ROUTE(app, "/robot/status").methods("GET"_method)
	([](crow::request& req, crow::response& res)
	{
		// Mock status response - TODO: Replace with actual connection check
		auto response = crow::json::wvalue();
		response["connected"] = true;
		response["status"] = "ready";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	app.port(30333).multithreaded().run();

	return 0;
}