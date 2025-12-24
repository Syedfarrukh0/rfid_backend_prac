import Fastify from "fastify";
import dotenv from "dotenv";
import { corsMiddleware } from "./middlewares/corsMiddleware";
import fastifyMultipart from "@fastify/multipart";
import fastifyHelmet from "@fastify/helmet";
import morganMiddleware from "./middlewares/morganMIddleware";
import registerRoutes from "./routes";
import os from "os";
import fastifyFormbody from "@fastify/formbody";

// Load environment variables
dotenv.config();

// Create Fastify Instance
const app = Fastify();

// Register Multipart for file uploads
app.register(fastifyFormbody);

// ✅ 2. Fastify ko JSON parser enable karein
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  function (req, body, done) {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  }
);

// ✅ 3. Agar raw body chahiye toh
app.addContentTypeParser(
  "*",
  { parseAs: "string" },
  function (req, body, done) {
    done(null, body);
  }
);

app.register(fastifyMultipart, {
  attachFieldsToBody: true,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
});

// Register CORS middleware
corsMiddleware(app);

// Register Helmet for security headers
app.register(fastifyHelmet);

// Use Morgan for logging
app.addHook("onRequest", (request, reply, done) => {
  morganMiddleware(request.raw, reply.raw, (err: any) => {
    if (err) console.error("❌ Morgan logging error:", err);
    done();
  });
});

// Register Routes
app.register(registerRoutes);

// Auto-detect system IPv4
function getLocalIPv4() {
  const nets = os.networkInterfaces();

  // 1️⃣ Wi-Fi / Wireless adapters ko pehle priority do
  const wifiKeywords = ["wi-fi", "wifi", "wlan", "wireless"];

  for (const name of Object.keys(nets)) {
    const lname = name.toLowerCase();

    if (!wifiKeywords.some((k) => lname.includes(k))) continue;

    for (const net of nets[name]!) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }

  // 2️⃣ Fallback: non-virtual ethernet (Docker / WSL ignore)
  for (const name of Object.keys(nets)) {
    const lname = name.toLowerCase();

    if (
      lname.includes("docker") ||
      lname.includes("veth") ||
      lname.includes("hyper-v") ||
      lname.includes("wsl") ||
      lname.includes("virtual")
    )
      continue;

    for (const net of nets[name]!) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }

  return "0.0.0.0";
}

export const HOST = getLocalIPv4();
// const HOST = "192.168.4.2";
export const PORT = parseInt(process.env.PORT || "5000", 10);

export let serverAddress: any;

// Server start karo
const start = async () => {
  console.log(HOST, "HOST");
  try {
    serverAddress = await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Server running at ${serverAddress}`);
    console.log(`📡 Local Network Access: http://${HOST}:${PORT}`);
  } catch (err) {
    console.log(err)
    app.log.error(err);
    process.exit(1);
  }
};

start();
