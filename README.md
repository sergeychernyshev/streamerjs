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
