#!/usr/bin/env node
import os from "os";
import net from "net";
import fs from "fs";
import url from "url";
import express from "express";
import path from "path";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import serveIndex from "serve-index";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import ejs from "ejs";

import PouchDB from "pouchdb";

import ExpressPutchDBFactory from "express-pouchdb";

let config;

// Read the content of package.json
const packageJsonPath = url.fileURLToPath(
  import.meta.resolve("./package.json"),
);
const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonContent);

// Access the version
const cliVersion = packageJson.version;

// to override the default config, create a config.json file
// in the root folder of your project
const default_config = {
  port: 2525,
  dbpath: "db",
  livereload: false,
  // IP address(es) to listen on, use "*" or "all" to listen on all interfaces
  ips: "127.0.0.1",
};

const LOCAL_IP = "127.0.0.1";

// if project defines the scripts, this object will contain them
let scripts = {};

try {
  // Read the contents of config.json synchronously
  const data = fs.readFileSync("config.json", "utf8");

  try {
    // Parse the JSON config data
    config = { ...default_config, ...JSON.parse(data) };
  } catch (jsonError) {
    console.error("Error parsing config.json:", jsonError);
    process.exit(1);
  }
} catch (fileError) {
  // use default config when config.json is not found
  config = default_config;
}

// CLI arguments
yargs(hideBin(process.argv))
  .scriptName("npx @streamerjs/streamerjs")
  .usage("$0 <cmd> [args]")
  .command(
    ["$0", "start"],
    "start StreamerJS application",
    {
      local: {
        type: "boolean",
        default: false,
        describe: `only listen on ${LOCAL_IP}, ignoring "ips" in config.json`,
      },
    },
    start,
  )
  // without this an unknown command falls through to the default one and
  // silently starts the server
  .strict()
  .help()
  .wrap(null)
  .version(cliVersion).argv;

// Returns a list of IPs to listen on or null to listen on all interfaces
function resolveListenIps(local) {
  if (local) {
    return [LOCAL_IP];
  }

  const ips = Array.isArray(config.ips) ? config.ips : [config.ips];

  if (
    ips.length === 0 ||
    ips.some((ip) => typeof ip !== "string" || ip.trim() === "")
  ) {
    console.error(
      'Error: "ips" in config.json must be an IP address, an array of IP addresses, or "*" to listen on all interfaces',
    );
    process.exit(1);
  }

  if (ips.includes("*") || ips.includes("all")) {
    return null;
  }

  return [...new Set(ips.map((ip) => ip.trim()))];
}

function isLoopback(ip) {
  return ip === "localhost" || ip === "::1" || ip.startsWith("127.");
}

// Returns IPv4 addresses of all network interfaces
function getAllInterfaceIps() {
  const networkInterfaces = os.networkInterfaces();

  const ips = [];

  // Iterate over each network interface
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    const interfaces = networkInterfaces[interfaceName];

    // Iterate over each interface
    interfaces.forEach((interfaceInfo) => {
      // Check if the address is an IPv4
      if (interfaceInfo.family === "IPv4") {
        ips.push(interfaceInfo.address);
      }
    });
  });

  return ips;
}

// Starts an HTTP server for the app on the given IP (or all interfaces if undefined)
function listen(app, port, ip) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, ip);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

async function registerServerScripts(db) {
  const serverDir = "server";
  if (!fs.existsSync(serverDir)) {
    return;
  }

  const files = fs.readdirSync(serverDir);
  const scriptsToLoad = files.filter((file) => path.extname(file) === ".mjs");

  if (scriptsToLoad.length === 0) {
    return;
  }

  console.log("\n🛠️ Registering Server Scripts...");

  for (const file of scriptsToLoad) {
    const filePath = path.join(process.cwd(), serverDir, file);
    try {
      const serverModule = await import(url.pathToFileURL(filePath));
      if (serverModule.default && typeof serverModule.default === "function") {
        console.log(`  - ✅ Loaded: ${file}`);
        new serverModule.default({ db });
      } else {
        console.log(`  - ⚠️  Skipped (no default export): ${file}`);
      }
    } catch (error) {
      console.error(`  - ❌ Error loading ${file}:`, error);
    }
  }
}

async function start(argv) {
  const insecurePort = config.port || process.env.PORT;

  // null means listening on all interfaces
  const listenIps = resolveListenIps(argv.local);

  const app = express();

  let liveReloadServer;

  if (config.livereload) {
    // Setup livereload
    liveReloadServer = livereload.createServer({ noListen: true });

    // livereload always listens on all interfaces, so we bind its HTTP server
    // to the same IP as the app, a single server can only bind to one IP though,
    // so it listens on all interfaces when multiple IPs are configured
    const liveReloadIp =
      listenIps && listenIps.length === 1 ? listenIps[0] : undefined;
    const liveReloadHttpServer = liveReloadServer.config.server;
    const liveReloadListen =
      liveReloadHttpServer.listen.bind(liveReloadHttpServer);
    liveReloadHttpServer.listen = (port) =>
      liveReloadListen(port, liveReloadIp);
    liveReloadServer.listen();

    // Use connect-livereload middleware
    app.use(connectLivereload());
  }

  // Scenes in user's project
  app.use(
    "/scenes/",
    express.static("scenes"),
    serveIndex("scenes", { icons: true }),
  );

  app.use("/assets/", express.static("assets"));

  if (liveReloadServer) {
    liveReloadServer.watch("./scenes/");

    // Assets in user's project
    liveReloadServer.watch("./assets/");
  }
  // streamer resources
  const templates = url.fileURLToPath(import.meta.resolve("./templates/"));
  app.set("view engine", "ejs").set("views", templates);

  let enableControlPanel = false;
  let db;

  // check if control folder exists to indicate that the user wants to create the control panel(s)
  if (fs.existsSync("control") || fs.existsSync("server")) {
    // Check if the db folder exists, create it if it doesn't
    if (!fs.existsSync(config.dbpath)) {
      try {
        fs.mkdirSync(config.dbpath, { recursive: true });
      } catch (error) {
        console.error(
          `Error creating PouchDB database folder: ${error.message}`,
        );
      }
    }

    const StreamerPouchDB = PouchDB.defaults({ prefix: config.dbpath + "/" });

    db = new StreamerPouchDB("streamer");

    if (fs.existsSync("control")) {
      enableControlPanel = true;

      // Control panel resources in user's project
      app.use("/control/", express.static("control"));

      if (config.livereload) {
        liveReloadServer.watch("./control/");
      }
    }

    /**
     * Server paths
     */
    const pouchDBLibPath = url.fileURLToPath(
      import.meta.resolve("pouchdb/dist/"),
    );
    // PouchDB client library
    app.use("/_resources/pouchdb/", express.static(pouchDBLibPath));

    const pouchApp = ExpressPutchDBFactory(StreamerPouchDB, {
      logPath: config.dbpath + "/log.txt",
      configPath: config.dbpath + "/config.json",
    });
    // PouchDB server
    app.use("/_db", pouchApp);
  }

  // Server index linking to other parts of the server
  app.get("/", (req, res) => {
    app.engine("ejs", ejs.renderFile);
    res.render("index", { control: enableControlPanel, version: cliVersion });
  });

  // Assets in user's project
  app.use(
    "/_resources/",
    express.static(url.fileURLToPath(import.meta.resolve("./resources/"))),
  );

  // HTTP server(s), one per IP
  try {
    await Promise.all(
      (listenIps || [undefined]).map((ip) => listen(app, insecurePort, ip)),
    );
  } catch (error) {
    if (error.code === "EADDRNOTAVAIL") {
      console.error(
        `Error: IP address ${error.address} is not available on this computer, check "ips" in config.json`,
      );
    } else if (error.code === "EADDRINUSE") {
      console.error(
        `Error: port ${error.port} is already in use on ${error.address}`,
      );
    } else {
      console.error("Error starting the server:", error);
    }
    process.exit(1);
  }

  const versionLabel = `v${cliVersion}`;
  const versionLabelSpaced = versionLabel.padEnd(54 - versionLabel.length);

  const asciiArt = `
  _________ __  ${versionLabelSpaced}____. _________
 /   _____//  |________   ____ _____    _____   ___________    |    |/   _____/
 \_____  \\\\    __\\_  __ \\_/ __ \\\\__  \\  /     \\_/ __ \\_  __ \\   |    |\\_____  \\
 /        \\|  |  |  | \\/\\  ___/ / __ \\|  Y Y  \\  ___/|  | \\/\\__|    |/        \\
/_______  /|__|  |__|    \\___  >____  /__|_|  /\\___  >__|  \\________/_______  /
        \\/                   \\/     \\/      \\/     \\/                       \\/
`;
  console.log(asciiArt);

  console.log("─".repeat(80));
  console.log("🚀 StreamerJS Server is running!");
  console.log("─".repeat(80));

  const features = [];

  if (db) {
    features.push("PouchDB Database\t📦");
  }
  if (enableControlPanel) {
    features.push("Control Panel\t🎛️");
  }
  if (fs.existsSync("server")) {
    features.push("Server Scripts\t🛠️");
  }
  if (config.livereload) {
    features.push("Live Reload\t🔄");
  }

  if (features.length > 0) {
    console.log("\n✨ Features:");
    features.forEach((feature) => {
      console.log(`  - ✅ ${feature}`);
    });
  }

  if (fs.existsSync("server")) {
    await registerServerScripts(db);
  }

  // only the root URL, the page it opens links to the scenes and the control panel
  const accessUrls = (listenIps || getAllInterfaceIps()).map((ip) => {
    // IPv6 addresses must be wrapped in brackets in URLs
    const host = net.isIPv6(ip) ? `[${ip}]` : ip;

    return `http://${host}:${insecurePort}`;
  });

  if (accessUrls.length > 0) {
    console.log("\n🔗 Access URLs:");
    accessUrls.forEach((accessUrl) => {
      console.log(`  - ${accessUrl}`);
    });
  }

  if (listenIps && listenIps.every(isLoopback)) {
    console.log(
      "\n🔒 Only accessible from this computer." +
        (argv.local
          ? ""
          : '\n   To allow access from other devices, set "ips" in config.json, e.g. "ips": "*"'),
    );
  }
  console.log("\n" + "─".repeat(80));
}
