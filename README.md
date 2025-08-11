# Streamer JS

Video stream layout manager for OBS Studio and other streaming application.

We use web technologies to manage the layout of the video stream and control it remotely using a web browser.

## Running the application

To run Streamer JS in your project, create a `/scenes/` sub-folder and put your scenes HTML files there.

Then just run the following command:

```bash
npx @streamerjs/streamerjs
```

## Scenes

Scenes are HTML files that are used to create the layout of the video stream. You can create multiple scenes and add them to OBS Studio as browser sources.

You can also create multiple files for different layers and group in folders per scene - ultimately, file organization is up to you.

### Create a basic scene

Run the following command to create a basic scene:

```bash
npx @streamerjs/streamerjs create-scene my-scene.html
```

Streamer JS will create a basic scene in `/scenes/` folder that has some basic HTML elements, CSS stylesheet and a JavaScript file that uses PouchDB synchronization with the [control panel](#control-panel).

For further customization, you can modify the scene HTML, CSS and JavaScript to accomplish whatever you want.

## Control Panel

To enable control panel, create a folder named `/control/` in the root of the project and add HTML page with a control panel that uses the PouchDB to update the UI.

### Create a basic control panel

To create a basic control panel file in `/control/` folder, run the following command:

```bash
npx @streamerjs/streamerjs create-control-panel index.html
```

The page will include the control panel HTML, CSS and JavaScript files and will use PouchDB to synchronize with the [scenes](#scenes).

## Server Scripts

You can now create server-side scripts in the `/server/` folder. These scripts can be used to customize the behavior of the Streamer JS application when it starts and has access to `db` object to initialize the application or to react to changes.

To enable scripts, create a `/server/` folder and add any number of `.mjs` files. Each file should export a default class. The constructor of the class will be called on application start and will receive an object with a `db` property.

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

To configure the application, you need to create a file named `config.json` in the root of the project. This file can contain the following information:

```json
{
  "port": 2525,
  "dbpath": "db"
}
```

- `port`: The port where the web server will run
- `dbpath`: The path where the database will be stored
