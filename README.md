# Stremer JS

Video stream layout manager for OBS Studio and other streaming application.

We use web technologies to manage the layout of the video stream and control it remotely using a web browser.

## Configuration

To configure the application, you need to create a file named `config.json` in the root of the project. This file can contain the following information:

```json
{
  "port": 2525,
  "dbpath": "db",
  "control": true
}
```

- `port`: The port where the web server will run
- `dbpath`: The path where the database will be stored
- `control`: If `true`, the application will allow remote control of the stream
