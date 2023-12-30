const db = (() => {
  var localDB = new PouchDB("streamer");

  const remoteURL = new URL("/_db/streamer", location.href).href;
  console.log("remoteURL", remoteURL);

  var remoteDB = new PouchDB(remoteURL);

  localDB
    .sync(remoteDB, {
      live: true,
      retry: true,
    })
    .on("change", function (change) {
      console.log("yo, something changed!", change);
    })
    .on("paused", function (info) {
      console.log(
        "replication was paused, usually because of a lost connection",
        info
      );
    })
    .on("active", function (info) {
      console.log("replication was resumed", info);
    })
    .on("error", function (err) {
      console.log("totally unhandled error (shouldn't happen)", err);
    });

  return localDB;
})();
