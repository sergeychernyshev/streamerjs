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

import OBSWebSocket, { EventSubscription } from "obs-websocket-js";

// Read the content of package.json
const packageJsonPath = url.fileURLToPath(
  import.meta.resolve("./package.json")
);
const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonContent);

// Access the version
const cliVersion = packageJson.version;

// Scripts in user's project
let scripts = {};

// to override the default config, create a config.json file
// in the root folder of your project
const default_config = {
  port: 2525,
  dbpath: "db",
  debug: false,
  obs: {
    host: "localhost",
    port: 4455,
  },
};

let config = {};
let configOverride = {};

try {
  // Read the contents of config.json synchronously
  const data = fs.readFileSync("config.json", "utf8");

  try {
    // Parse the JSON config data
    configOverride = JSON.parse(data);
  } catch (jsonError) {
    console.error("Error parsing config.json:", jsonError);
    process.exit(1);
  }
} catch (fileError) {
  // No config.json file found, using default config
}

// override the default config
config = {
  ...default_config,
  ...configOverride,
  obs: { ...default_config.obs, ...configOverride.obs },
};

// Debugging helper
const debug = { log: console.log };
if (config.debug) {
  debug.log = (first, ...rest) => {
    console.log("[DEBUG]", first, ...rest);
  };
} else {
  debug.log = () => {};
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

    const db = new StreamerPouchDB("streamer");

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

    setupOBS(db);
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

async function registerScripts(db, obs) {
  if (fs.existsSync("control/scripts.mjs")) {
    scripts = await import(process.cwd() + "/control/scripts.mjs");
  }

  setupScriptQueue(db, obs);
}

async function setupOBS(db) {
  // delete obs docs if it exists
  await db
    .get("obs")
    .then((doc) => {
      doc._deleted = true;
      return db.put(doc);
    })
    .catch((error) => {});

  // delete OBS commands queue if it exists
  await db
    .get("obs_commands")
    .then((doc) => {
      doc._deleted = true;
      return db.put(doc);
    })
    .catch((error) => {});

  // Connect to OBS
  debug.log(`Connecting to OBS on ${config.obs?.host}:${config.obs?.port}`);

  const obs = new OBSWebSocket();

  // Declare some events to listen for.
  obs.on("ConnectionOpened", () => {
    debug.log("OBS Connection Opened");
  });

  obs.on("Identified", () => {
    debug.log("OBS Identified, good to go!");
  });

  try {
    const OBSInfo = await obs.connect(
      `ws://${config.obs?.host}:${config.obs?.port}`,
      config.obs?.password,
      {
        eventSubscriptions:
          EventSubscription.General | EventSubscription.Scenes,
      }
    );

    debug.log("Connected to OBS and identified", OBSInfo);

    registerScripts(db, obs);

    OBSInit(db, obs);
  } catch (error) {
    console.error("Failed to connect to OBS: ", error);
    console.log("OBS control functionality disabled.");
  }
}

async function OBSInit(db, obs) {
  // just report errors on OBS failures, don't stop the server
  try {
    updateOBSCurrentSceneAndItems(db, obs);
    obs.on("CurrentProgramSceneChanged", () => {
      updateOBSCurrentSceneAndItems(db, obs);
    });

    setupOBSCommandQueue(db, obs);
  } catch (error) {
    console.error("OBS Error", error);
  }
}

async function updateOBSCurrentSceneAndItems(db, obs) {
  debug.log("Updating OBS current scene and items");

  const scenes = await obs.call("GetSceneList");

  const itemsResult = await obs.call("GetSceneItemList", {
    sceneName: scenes.currentProgramSceneName,
  });

  let doc;

  try {
    doc = await db.get("obs");
  } catch (error) {
    doc = { _id: "obs" };
  }

  doc.scenes = scenes;
  doc.items = itemsResult;

  debug.log("Updating OBS doc", doc);

  db.put(doc);
}

async function setupScriptQueue(db, obs) {
  debug.log("Setting up script queue");

  // delete scripts queue doc if it exists
  await db
    .get("scripts_queue")
    .then((doc) => {
      doc._deleted = true;
      return db.put(doc);
    })
    .catch((error) => {});

  // Scripts queue
  await db.put({
    _id: "scripts_queue",
    queue: [],
  });

  // monitor DB changes
  db.changes({
    since: "now",
    live: true,
    include_docs: true,
  }).on("change", (change) => {
    if (change.id == "scripts_queue") {
      const scriptCalls = change.doc.queue;

      // only empty the queue if there are commands, otherwise we get stuck in a loop
      if (change.doc.queue.length > 0) {
        change.doc.queue = [];
        db.put(change.doc);
      }

      scriptCalls.forEach(async (call) => {
        try {
          debug.log("Calling a script: ", call);
          const result = await scripts[call.name](call.params || [], {
            debug,
            db,
            obs,
          });
          debug.log("[Script Call Result] call: ", call, "result:", result);
        } catch (error) {
          console.error("Script Call Error", error);
        }
      });
    }
  });
}

async function setupOBSCommandQueue(db, obs) {
  debug.log("Setting up OBS command queue");

  // OBS commands queue
  db.put({
    _id: "obs_commands",
    queue: [],
  });

  // monitor DB changes
  db.changes({
    since: "now",
    live: true,
    include_docs: true,
  }).on("change", (change) => {
    // debug.log("DB change", change);

    if (change.id == "obs_commands") {
      const commands = change.doc.queue;
      // debug.log("Commands:", commands);

      commands.forEach(async (command) => {
        try {
          debug.log("Calling OBS: ", command);
          const result = await obs.call(
            command.requestType,
            command.requestData || {}
          );
          debug.log("[OBS Call Result] command: ", command, "result:", result);
        } catch (error) {
          console.error("OBS Error", error);
        }
      });

      // only empty the queue if there are commands, otherwise we get stuck in a loop
      if (commands.length > 0) {
        change.doc.queue = [];
        db.put(change.doc);
      }
    }
  });
}
