const localDB = new PouchDB("streamer");

const remoteURL = new URL("/db/streamer", location.href).href;
console.log("remoteURL", remoteURL);
const remoteDB = new PouchDB(remoteURL);

localDB.sync(remoteDB, {
  live: true,
  retry: true,
});

localDB
  .changes({
    since: "now",
    live: true,
    include_docs: true,
  })
  .on("change", updateUI);

init();

updateUI();

/**
 * basic counter implementation
 */
function updateUI(change) {
  console.log(change);
  localDB.get("scene1").then(function (result) {
    document.getElementById("counter").textContent = result.counter;
  });
}

function init() {
  localDB
    .get("scene1")
    .then(function (result) {
      // if scene is known, check if it has a counter
      if (!result.counter) {
        localDB.put({
          ...result,
          counter: 0,
        });
      }
    })
    .catch(function (err) {
      // if scene is unknown, create it
      localDB.put({
        _id: "scene1",
        counter: 0,
      });
    });
}

document.getElementById("increment").addEventListener("click", () => {
  localDB.get("scene1").then(function (result) {
    result.counter++;
    localDB.put(result);
  });
});
