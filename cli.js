#!/usr/bin/env node
import os from "os";
import fs from "fs";
import url from "url";
import express from "express";
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
  import.meta.resolve("./package.json")
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
};

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
    (yargs) => {},
    start
  )
  .command(
    "create-scene [file-name]",
    "create a new scene in /scenes/ folder",
    {
      fileName: {
        alias: "f",
        default: "index.html",
      },
    },
    (argv) => {
      createScene(argv.fileName);
      process.exit(0);
    }
  )
  .command(
    "create-control-panel [file-name]",
    "create a new control panel in /control/ folder",
    {
      fileName: {
        alias: "f",
        default: "index.html",
      },
    },
    (argv) => {
      createControlPanel(argv.fileName);
      process.exit(0);
    }
  )
  .help()
  .wrap(null)
  .version(cliVersion).argv;

function createScene(fileName) {
  if (!fs.existsSync("scenes")) {
    console.log("Creating /scenes/ folder");
    fs.mkdirSync("scenes");
  }

  console.log(`Creating a new scene file: scenes/${fileName}`);
  if (fs.existsSync(`scenes/${fileName}`)) {
    console.error(`Error: Scene ${fileName} already exists in /scenes/ folder`);
    process.exit(1);
  }

  fs.copyFileSync(
    url.fileURLToPath(import.meta.resolve("./boilerplate/scene/index.html")),
    `scenes/${fileName}`
  );
}

function createControlPanel(fileName) {
  if (!fs.existsSync("control")) {
    console.log("Creating /control/ folder");
    fs.mkdirSync("control");
  }

  console.log(`Creating a new control panel file: control/${fileName}`);
  if (fs.existsSync(`control/${fileName}`)) {
    console.error(
      `Error: Control panel ${fileName} already exists in /control/ folder`
    );
    process.exit(1);
  }

  fs.copyFileSync(
    url.fileURLToPath(import.meta.resolve("./boilerplate/control/index.html")),
    `control/${fileName}`
  );
}

function start() {
  const insecurePort = config.port || process.env.PORT;

  const app = express();

  // Setup livereload
  const liveReloadServer = livereload.createServer();

  // Use connect-livereload middleware
  app.use(connectLivereload());

  // Scenes in user's project
  app.use(
    "/scenes/",
    express.static("scenes"),
    serveIndex("scenes", { icons: true })
  );
  liveReloadServer.watch("./scenes/");

  // Assets in user's project
  app.use("/assets/", express.static("assets"));
  liveReloadServer.watch("./assets/");

  console.log("Livereload enabled for /scenes/ and /assets/ folders");

  // streamer resources
  const templates = url.fileURLToPath(import.meta.resolve("./templates/"));
  app.set("view engine", "ejs").set("views", templates);

  let enableControlPanel = false;

  // check if control folder exists to indicate that the user wants to create the control panel(s)
  if (fs.existsSync("control")) {
    enableControlPanel = true;

    // Check if the db folder exists, create it if it doesn't
    if (!fs.existsSync(config.dbpath)) {
      try {
        fs.mkdirSync(config.dbpath, { recursive: true });
        console.log(`PouchDB database folder created at: ${config.dbpath}`);
      } catch (error) {
        console.error(
          `Error creating PouchDB database folder: ${error.message}`
        );
      }
    }

    const StreamerPouchDB = PouchDB.defaults({ prefix: config.dbpath + "/" });

    new StreamerPouchDB("streamer");

    // Control panel resources in user's project
    app.use("/control/", express.static("control"));
    liveReloadServer.watch("./control/");

    console.log("Livereload enabled for /control/ folder");

    /**
     * Server paths
     */
    const pouchDBLibPath = url.fileURLToPath(
      import.meta.resolve("Pouchdb/dist/")
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

  // Get network interfaces
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

  // Server index linking to other parts of the server
  app.get("/", (req, res) => {
    app.engine("ejs", ejs.renderFile);
    res.render("index", { control: enableControlPanel });
  });

  // Assets in user's project
  app.use(
    "/_resources/",
    express.static(url.fileURLToPath(import.meta.resolve("./resources/")))
  );

  // HTTP server
  app.listen(insecurePort);

  console.log(`StreamerJS (v${cliVersion}) server listening on:`);
  ips.forEach((ip) => {
    console.log(`http://${ip}:${insecurePort}`);
  });

  if (enableControlPanel) {
    console.log("\nControl your stream by opening:");
    ips.forEach((ip) => {
      console.log(`http://${ip}:${insecurePort}/control/`);
    });
  }
}
