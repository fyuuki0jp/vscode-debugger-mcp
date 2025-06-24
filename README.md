# VSCode Debugger MCP Server

VSCode extension that provides an MCP (Model Context Protocol) server for debugging integration.

## Features

This extension provides MCP tools for controlling VSCode's debugger:

- **Breakpoint Management**: Set and remove breakpoints in your code
- **Expression Evaluation**: Evaluate expressions during debug sessions
- **Debug Configuration**: List available debug configurations from launch.json
- **Session Control**: Start and stop debugging sessions
- **Step Execution**: Control debugger stepping (step over, into, out, continue, pause)
- **Status Monitoring**: Get current debug status including active sessions and breakpoints

## MCP Tools

### set_breakpoint
Set a breakpoint at a specific line in a file. Supports both absolute and relative paths.
```json
{
  "path": "src/index.js",  // relative to workspace
  "line": 42,
  "condition": "i > 10"  // optional
}
```

### remove_breakpoint
Remove a breakpoint at a specific line. Supports both absolute and relative paths.
```json
{
  "path": "src/index.js",  // relative to workspace
  "line": 42
}
```

### evaluate_expression
Evaluate an expression in the current debug context.
```json
{
  "expression": "myVariable.someProperty",
  "frameId": 0  // optional
}
```

### list_debug_configurations
List all available debug configurations from launch.json files.

### start_debugging
Start a debugging session.
```json
{
  "configName": "Run Extension"  // optional
}
```

### stop_debugging
Stop the current debugging session.

### get_debug_status
Get the current debug status including:
- Active session information
- Available threads and active thread ID
- Stack frames (when paused)
- Breakpoints with relative paths

Example response:
```json
{
  "isActive": true,
  "isPaused": true,
  "activeSession": {
    "id": "1",
    "name": "Launch Program",
    "type": "node"
  },
  "threads": [
    { "id": 1, "name": "main" }
  ],
  "activeThreadId": 1,
  "stackFrames": [
    {
      "id": 1,
      "name": "myFunction",
      "source": { "path": "src/index.js", "name": "index.js" },
      "line": 42,
      "column": 5
    }
  ],
  "breakpoints": [...]
}
```

### step_debugger
Control debugger stepping during an active debug session.
```json
{
  "type": "stepOver",  // stepOver, stepInto, stepOut, continue, pause
  "threadId": 1  // optional - defaults to active thread
}
```

**Note**: You can get the thread ID from `get_debug_status`. If not specified, the debugger will use the currently active thread.

## Communication

The extension runs an SSE (Server-Sent Events) server on `http://localhost:6010/sse` for MCP client communication.

### Endpoints

- `GET /sse` - SSE connection endpoint
- `POST /sse` - Send MCP requests
- `GET /health` - Health check endpoint

## Development

1. Clone the repository
2. Run `npm install`
3. Open in VSCode
4. Press `F5` to run the extension in a new Extension Development Host window

## Building the Extension

### Standard Build
```bash
npm run build
```
This creates `vscode-debugger-mcp-0.0.1.vsix` file.

### Optimized Bundle Build
```bash
npm run package-bundle
```
This creates a webpack-bundled version for better performance.

### Available Scripts
- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode compilation
- `npm run lint` - Run ESLint
- `npm run package` - Create .vsix package
- `npm run build` - Compile and package
- `npm run webpack` - Bundle with webpack
- `npm run package-bundle` - Bundle and package

## Installation

1. Build the extension using one of the methods above
2. In VSCode, go to Extensions view
3. Click the "..." menu and select "Install from VSIX..."
4. Select the generated `.vsix` file

## Usage

1. The MCP server starts automatically when the extension activates
2. Connect your MCP client to `http://localhost:6010/sse`
3. Send JSON-RPC 2.0 requests to control the debugger

## Commands

- `Start MCP Debug Server` - Manually start the server
- `Stop MCP Debug Server` - Stop the server
- Click the status bar item to toggle the server

## Requirements

- VSCode 1.80.0 or higher
- Node.js 16.x or higher

## License

MIT License - see [LICENSE](LICENSE) file for details.