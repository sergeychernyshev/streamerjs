# Streamer JS

Video stream layout manager for OBS Studio and other streaming application.

We use web technologies to manage the layout of the video stream and control it remotely using a web browser.

## Getting started

Create a new project with a sample scene and control panel:

```bash
npm create streamerjs my-stream
cd my-stream
npm start
```

## Running the application

To run Streamer JS in an existing project, create a `/scenes/` sub-folder and put your scenes HTML files there.

Then just run the following command:

```bash
npx @streamerjs/streamerjs
```

By default, Streamer JS only listens on `127.0.0.1`, so it is only accessible from the same computer. To open scenes or the control panel from other devices (e.g. a phone or another computer running OBS Studio), set [`ips`](#additional-configuration) in `config.json`.

To force listening on `127.0.0.1` regardless of the configuration, use the `--local` flag:

```bash
npx @streamerjs/streamerjs --local
```

## Scenes

Scenes are HTML files that are used to create the layout of the video stream. You can create multiple scenes and add them to OBS Studio as browser sources.

You can also create multiple files for different layers and group in folders per scene - ultimately, file organization is up to you.

### Create a basic scene

Run the following command to create a basic scene:

```bash
npm create streamerjs scene my-scene.html
```

Streamer JS will create a basic scene in `/scenes/` folder that has some basic HTML elements, CSS stylesheet and a JavaScript file that uses PouchDB synchronization with the [control panel](#control-panel).

For further customization, you can modify the scene HTML, CSS and JavaScript to accomplish whatever you want.

## Control Panel

To enable control panel, create a folder named `/control/` in the root of the project and add HTML page with a control panel that uses the PouchDB to update the UI.

### Create a basic control panel

To create a basic control panel file in `/control/` folder, run the following command:

```bash
npm create streamerjs control-panel index.html
```

The page will include the control panel HTML, CSS and JavaScript files and will use PouchDB to synchronize with the [scenes](#scenes).

## Node Graph

The node graph is a visual canvas where you wire control panel buttons to OBS
Studio actions. Open it at `/graph/`.

Every project with a `/control/` or `/server/` folder gets one, because the
graph is stored in the same PouchDB database. It saves as you work and syncs
live, so a graph edited on your laptop is immediately live on the stream
machine.

### Connecting to OBS Studio

In OBS, turn on **Tools → WebSocket Server Settings → Enable WebSocket server**
and note the port and password, then add an `obs` section to `config.json`:

```json
{
  "obs": {
    "url": "ws://127.0.0.1:4455",
    "password": "your-obs-websocket-password"
  }
}
```

StreamerJS connects on start and reconnects on its own when OBS is closed and
reopened, so you can start them in either order. Without an `obs` section you
can still build a graph, but actions will report that OBS is not configured.

### Nodes

| Node                  | What it does                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Button trigger**    | A button in your control panel. Everything wired downstream of it runs when the button is pressed. |
| **Switch scene**      | Makes an OBS scene the program scene.                                                              |
| **Source visibility** | Shows, hides or toggles a source inside a scene.                                                   |

Add nodes from the toolbar, drag from a trigger's right handle to an action's
left handle to connect them, and select a node or edge and press `Delete` to
remove it. Actions can be chained: wire one action into the next and they run
in order, top to bottom on the canvas. A step that fails does not stop the ones
after it, so a missing source can't take down the rest of a scene change.

Scene and source fields suggest the real names from OBS while it is connected,
and accept anything you type when it is not.

Press **▶ Test** on a trigger to run it without leaving the editor.

### Firing triggers from a control panel

Load the client script in your control panel:

```html
<script src="/_resources/graph.js"></script>
```

The quickest way to get every trigger onto the page, kept up to date as you
edit the graph:

```html
<streamer-trigger-panel></streamer-trigger-panel>
```

To place and style buttons yourself, wrap your own markup. Writing it as a form
means the button still works if JavaScript hasn't loaded yet:

```html
<streamer-trigger trigger-id="go-live">
  <form method="post" action="/_graph/trigger/go-live">
    <button>Go live</button>
  </form>
</streamer-trigger>
```

A trigger that fails gets a `data-failed` attribute and a `title` explaining
why, and every run raises a `streamer-trigger-run` event carrying the result,
so you can style or react to it however you like.

From your own code:

```javascript
const run = await StreamerGraph.trigger("go-live");
```

### HTTP API

The editor and the control panel both use these, and so can anything else on
your network — a Stream Deck, a shell script, a foot pedal:

| Endpoint                              | Purpose                                   |
| ------------------------------------- | ----------------------------------------- |
| `POST /_graph/trigger/:id`            | Fire a trigger and report what ran        |
| `GET /_graph/triggers`                | List the triggers in the graph            |
| `GET /_graph/status`                  | OBS connection state and graph size       |
| `GET /_graph/graph`                   | The graph as the server sees it           |
| `GET /_graph/obs/scenes`              | Scene names and the current program scene |
| `GET /_graph/obs/scenes/:scene/items` | Sources in a scene                        |

## Server Scripts

You can now create server-side scripts in the `/server/` folder. These scripts can be used to customize the behavior of the Streamer JS application when it starts and has access to `db` object to initialize the application or to react to changes.

To enable scripts, create a `/server/` folder and add any number of `.mjs` files. Each file should export a default class. The constructor of the class will be called on application start and will receive an object with a `db` property.

To create a sample server script, run the following command:

```bash
npm create streamerjs server-script my-script.mjs
```

Here's an example:

```javascript
// sample `server/my-script.mjs` logging current state
// of a document in the database on startup
export default class MyScript {
  constructor({ db }) {
    db.get("my_scene")
      .then(function (doc) {
        console.log("Current my_scene document:", doc);
      })
      .catch(function (err) {
        if (err.name !== "not_found") {
          console.error("Error fetching my_scene document:", err);
        }
      });
  }
}
```

Scripts currently can't be called directly from the client, unless you somehow pass messages through a DB queue document making scripts listen to database changes, picking up and processing those messages.

We hope to implement this kind of RPC functionality soon so you don't have to jump through hoops to accomplish that.

## Help

To get help, run the following command:

```bash
npx @streamerjs/streamerjs --help
```

## Additional Configuration

To configure the application, you need to create a file named `config.json` in the root of the project (`npm create streamerjs config` creates one with default settings). This file can contain the following information:

```json
{
  "port": 2525,
  "dbpath": "db",
  "ips": "127.0.0.1",
  "livereload": false,
  "graph": "auto",
  "obs": {
    "url": "ws://127.0.0.1:4455",
    "password": "your-obs-websocket-password"
  }
}
```

- `port`: The port where the web server will run
- `dbpath`: The path where the database will be stored
- `ips`: IP address or an array of IP addresses to listen on, defaults to `"127.0.0.1"`. Use `"*"` (or `"all"`) to listen on all network interfaces, which makes Streamer JS accessible to anyone on your network, so only use it on networks you trust.

  ```json
  {
    "ips": ["127.0.0.1", "192.168.1.10"]
  }
  ```

- `livereload`: Reload scenes and control panels when their files change
- `graph`: `"auto"` enables the [node graph](#node-graph) whenever the database
  is enabled, `true` turns it on unconditionally, `false` turns it off
- `obs`: OBS WebSocket connection used by the [node graph](#node-graph),
  omitted when you don't use it

## Developing StreamerJS

The node graph editor is a [React Flow](https://reactflow.dev/) app built ahead
of time into `resources/graph-editor/`, so running StreamerJS never needs a
build step. After changing anything under `src/graph-editor/`, rebuild the
bundle and commit it along with your change:

```bash
npm install
npm run build
```
