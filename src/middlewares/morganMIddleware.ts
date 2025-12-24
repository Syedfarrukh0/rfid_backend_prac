import morgan from "morgan";
import fs from "fs";
import path from "path";

// Log file location
const logFilePath = path.join(__dirname, "../../logs/access.log");

// Ensure logs directory exists
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(logFilePath, { flags: "a" });

const morganMiddleware = morgan("combined", {
  stream: accessLogStream,
});

export default morganMiddleware;
