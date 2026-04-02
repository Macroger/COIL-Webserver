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
#include "MySocket.h"
#include "pktdef.h"

using namespace std;

int main()
{
	crow::SimpleApp app;
    
	// Shared socket manager and mutex for thread-safe use in route handlers
	std::shared_ptr<coil::protocol::MySocket> socketMgr;
	try {
		socketMgr = std::make_shared<coil::protocol::MySocket>(
			coil::protocol::SocketType::CLIENT,
			coil::protocol::ConnectionType::TCP,
			23501,
			coil::protocol::constants::DEFAULT_SIZE,
			std::string("127.0.0.1")
		);
	}
	catch (const std::exception &e) {
		std::cerr << "Warning: MySocket init failed: " << e.what() << std::endl;
		socketMgr = nullptr; // will attempt lazy init in route
	}
	std::mutex socketMutex;

	// Main landing page
	CROW_ROUTE(app, "/")
	([](crow::response& res)
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

		// Check if sending the checkout page - if so, 
		// send a 401 response along with the page.
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

	// Robot Control Endpoints (Mock for prototype)
	// POST /robot/move - Execute movement command
	CROW_ROUTE(app, "/robot/move").methods("POST"_method)
	([](const crow::request& req, crow::response& res)
	{
		auto body = crow::json::load(req.body);
		
		if (!body)
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Invalid JSON"})");
		}
		else
		{
			std::string direction = body["direction"].s();
			double distance = body["distance"].d();
			double duration = body["duration"].d();
			int power = static_cast<int>(body["power"].d());
			
			// Mock response - TODO: Replace with actual robot communication
			auto response = crow::json::wvalue();
			response["status"] = "success";
			response["command"] = "MOVE";
			response["direction"] = direction;
			response["distance"] = distance;
			response["duration"] = duration;
			response["power"] = power;
			response["timestamp"] = static_cast<long long>(std::time(nullptr));
			
			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		
		res.end();
	});

	// POST /robot/turn - Execute rotation command
	CROW_ROUTE(app, "/robot/turn").methods("POST"_method)
	([](const crow::request& req, crow::response& res)
	{
		auto body = crow::json::load(req.body);
		
		if (!body)
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Invalid JSON"})");
		}
		else
		{
			std::string direction = body["direction"].s();
			double angle = body["angle"].d();
			double duration = body["duration"].d();
			int power = static_cast<int>(body["power"].d());
			
			// Mock response - TODO: Replace with actual robot communication
			auto response = crow::json::wvalue();
			response["status"] = "success";
			response["command"] = "TURN";
			response["direction"] = direction;
			response["angle"] = angle;
			response["duration"] = duration;
			response["power"] = power;
			response["timestamp"] = static_cast<long long>(std::time(nullptr));
			
			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		
		res.end();
	});
	

	// POST /robot/connect - Configure and connect to robot
	CROW_ROUTE(app, "/robot/connect").methods("POST"_method)
	([](const crow::request& req, crow::response& res)
	{
		auto body = crow::json::load(req.body);
		
		if (!body)
		{
			res.code = 400;
			res.set_header("Content-Type", "application/json");
			res.write(R"({"status":"error","message":"Invalid JSON"})");
		}
		else
		{
			std::string ip = body["ip"].s();
			int port = static_cast<int>(body["port"].d());
			std::string mode = body["mode"].s();
			
			try{
				if(mode == "TCP")
				{
					coil::protocol::MySocket client(coil::protocol::SocketType::CLIENT, coil::protocol::ConnectionType::TCP, 29000, 255, "10.172.41.150");
					client.ConnectTCP();
				}
			}
			catch(const std::exception& e)
			{
				res.code = 500;
				res.set_header("Content-Type", "application/json");
				res.write(R"({"status":"error","message":"Failed to connect to robot: )" + std::string(e.what()) + R"("})");
				res.end();
				return;
			}
			




			auto response = crow::json::wvalue();
			response["status"] = "success";
			response["message"] = "Connected to robot";
			response["ip"] = ip;
			response["port"] = port;
			response["mode"] = mode;
			response["timestamp"] = static_cast<long long>(std::time(nullptr));
			
			res.code = 200;
			res.set_header("Content-Type", "application/json");
			res.write(response.dump());
		}
		
		res.end();
	});

	// POST /robot/disconnect - Disconnect from robot
	CROW_ROUTE(app, "/robot/disconnect").methods("POST"_method)
	([](const crow::request& req, crow::response& res)
	{
		auto response = crow::json::wvalue();
		response["status"] = "success";
		response["message"] = "Disconnected from robot";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	// GET /robot/check-connection - Check current connection status
	CROW_ROUTE(app, "/robot/check-connection").methods("GET"_method)
	([](crow::request& req, crow::response& res)
	{
		// Mock response - TODO: Replace with actual connection check
		auto response = crow::json::wvalue();
		response["connected"] = true;
		response["status"] = "active";
		response["message"] = "Connection is active";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));
		
		res.code = 200;
		res.set_header("Content-Type", "application/json");
		res.write(response.dump());
		res.end();
	});

	// GET /robot/telemetry - Request robot status/telemetry
	CROW_ROUTE(app, "/robot/telemetry").methods("GET"_method)
	([](crow::request& req, crow::response& res)
	{
		// Mock telemetry response - TODO: Replace with actual robot telemetry
		auto response = crow::json::wvalue();
		response["battery"] = 85;
		response["position"] = "(0.0, 0.0)";
		response["orientation"] = 0.0;
		response["status"] = "idle";
		response["timestamp"] = static_cast<long long>(std::time(nullptr));
		
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

	app.port(23500).multithreaded().run();

	return 0;
}