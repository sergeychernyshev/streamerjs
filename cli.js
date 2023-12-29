#!/usr/bin/env node
import os from "os";
import fs from "fs";
import url from "url";
import express from "express";
import serveIndex from "serve-index";

import ejs from "ejs";

import PouchDB from "pouchdb";

import ExpressPutchDBFactory from "express-pouchdb";

let config;

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

const insecurePort = config.port || process.env.PORT;

const app = express();

// project resources
app.use(
  "/scenes",
  express.static("scenes"),
  serveIndex("scenes", { icons: true })
);
app.use("/assets/", express.static("assets"));

// streamer resources
const templates = url.fileURLToPath(import.meta.resolve("./public/"));
app.set("view engine", "ejs").set("views", templates);

app.get("/", (req, res) => {
  app.engine("ejs", ejs.renderFile);
  res.render("index", { control: config.control });
});

if (config.control) {
  // Check if the db folder exists, create it if it doesn't
  if (!fs.existsSync(config.dbpath)) {
    try {
      fs.mkdirSync(config.dbpath, { recursive: true });
      console.log(`PuchDB database folder created at: ${config.dbpath}`);
    } catch (error) {
      console.error(`Error creating PuchDB database folder: ${error.message}`);
    }
  }

  const StreamerPouchDB = PouchDB.defaults({ prefix: config.dbpath + "/" });

  const streamerStore = new StreamerPouchDB("streamer");

  streamerStore
    .changes({
      since: "now",
      live: true,
    })
    .on("change", onDataChange);

  function onDataChange(change) {
    console.log("Data change: ", change);
  }

  const controlPath = url.fileURLToPath(import.meta.resolve("./control/"));
  console.log("controlPath", controlPath);
  app.use("/control/", express.static(controlPath));

  const pouchDBLibPath = url.fileURLToPath(
    import.meta.resolve("Pouchdb/dist/")
  );
  console.log("pouchDBLibPath", pouchDBLibPath);
  app.use("/pouchdb/", express.static(pouchDBLibPath));

  const pouchApp = ExpressPutchDBFactory(StreamerPouchDB, {
    logPath: config.dbpath + "/log.txt",
    configPath: config.dbpath + "/config.json",
  });
  app.use("/db", pouchApp);
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

// HTTP server
app.listen(insecurePort);

console.log("StreamerJS server listening on:");
ips.forEach((ip) => {
  console.log(`http://${ip}:${insecurePort}`);
});

if (config.control) {
  console.log("\nControl your stream by opening:");
  ips.forEach((ip) => {
    console.log(`http://${ip}:${insecurePort}/control/`);
  });
}
