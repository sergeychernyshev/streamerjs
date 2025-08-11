#!/usr/bin/env node
import os from "os";
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
  livereload: false,
};

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

function createAsciiTable(data) {
  if (!data || data.length === 0) {
    return "";
  }

  // A simplified way to calculate visual width of a string containing emojis.
  // It strips variation selectors that can affect `.length`.
  // A full solution would require a library like `string-width`.
  const stringWidth = (str) => {
    return str.replace(/[\uFE00-\uFE0F]/g, "").length;
  };

  const headers = Object.keys(data[0]);
  const columnWidths = headers.map((header) => stringWidth(header));

  data.forEach((row) => {
    headers.forEach((header, i) => {
      const value = String(row[header]);
      const width = stringWidth(value);
      if (width > columnWidths[i]) {
        columnWidths[i] = width;
      }
    });
  });

  const padding = 1;

  const formatRow = (rowData) => {
    let rowStr = "│";
    rowData.forEach((cell, i) => {
      const cellStr = String(cell);
      const len = stringWidth(cellStr);
      const totalPadding = columnWidths[i] - len + padding * 2;
      const paddingLeft = " ".repeat(padding);
      const paddingRight = " ".repeat(totalPadding - padding);
      rowStr += `${paddingLeft}${cellStr}${paddingRight}│`;
    });
    return rowStr;
  };

  const createSeparator = (left, middle, right, line) => {
    let sepStr = left;
    columnWidths.forEach((width, i) => {
      sepStr += line.repeat(width + padding * 2);
      if (i < columnWidths.length - 1) {
        sepStr += middle;
      }
    });
    sepStr += right;
    return sepStr;
  };

  const topBorder = createSeparator("┌", "┬", "┐", "─");
  const headerSeparator = createSeparator("├", "┼", "┤", "─");
  const bottomBorder = createSeparator("└", "┴", "┘", "─");

  let table = [topBorder, formatRow(headers), headerSeparator];

  data.forEach((row) => {
    const rowCells = headers.map((header) => row[header]);
    table.push(formatRow(rowCells));
  });

  table.push(bottomBorder);

  return table.join("\n");
}

async function start() {
  const insecurePort = config.port || process.env.PORT;

  const app = express();

  let liveReloadServer;

  if (config.livereload) {
    // Setup livereload
    liveReloadServer = livereload.createServer();

    // Use connect-livereload middleware
    app.use(connectLivereload());
  }

  // Scenes in user's project
  app.use(
    "/scenes/",
    express.static("scenes"),
    serveIndex("scenes", { icons: true })
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
          `Error creating PouchDB database folder: ${error.message}`
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
    res.render("index", { control: enableControlPanel, version: cliVersion });
  });

  // Assets in user's project
  app.use(
    "/_resources/",
    express.static(url.fileURLToPath(import.meta.resolve("./resources/")))
  );

  // HTTP server
  app.listen(insecurePort, async () => {
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

    const accessUrls = [];
    ips.forEach((ip) => {
      const urls = {
        Location: `http://${ip}:${insecurePort}`,
        Scenes: `http://${ip}:${insecurePort}/scenes/`,
      };
      if (enableControlPanel) {
        urls["Control Panel"] = `http://${ip}:${insecurePort}/control/`;
      }
      accessUrls.push(urls);
    });

    if (accessUrls.length > 0) {
      console.log("\n🔗 Access URLs:");
      console.log(createAsciiTable(accessUrls));
    }
    console.log("\n" + "─".repeat(80));
  });
}
