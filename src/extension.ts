import * as vscode from 'vscode';
import { SSEServer } from './sseServer';

let sseServer: SSEServer | null = null;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('VSCode Debugger MCP');
  outputChannel.appendLine('VSCode Debugger MCP extension activated');

  // Create SSE server instance
  sseServer = new SSEServer(context);

  // Register start server command
  const startServerCommand = vscode.commands.registerCommand('vscode-debugger-mcp.startServer', async () => {
    if (!sseServer) {
      sseServer = new SSEServer(context);
    }

    if (sseServer.isRunning()) {
      vscode.window.showInformationMessage('MCP Debug Server is already running on http://localhost:6010/sse');
      return;
    }

    try {
      await sseServer.start(6010);
      vscode.window.showInformationMessage('MCP Debug Server started on http://localhost:6010/sse');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to start MCP Debug Server: ${errorMessage}`);
      outputChannel.appendLine(`Error starting server: ${errorMessage}`);
    }
  });

  // Register stop server command
  const stopServerCommand = vscode.commands.registerCommand('vscode-debugger-mcp.stopServer', async () => {
    if (!sseServer || !sseServer.isRunning()) {
      vscode.window.showInformationMessage('MCP Debug Server is not running');
      return;
    }

    try {
      await sseServer.stop();
      vscode.window.showInformationMessage('MCP Debug Server stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to stop MCP Debug Server: ${errorMessage}`);
      outputChannel.appendLine(`Error stopping server: ${errorMessage}`);
    }
  });

  // Auto-start server on activation
  vscode.commands.executeCommand('vscode-debugger-mcp.startServer');

  // Register status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(debug-alt) MCP Debug Server';
  statusBarItem.tooltip = 'Click to toggle MCP Debug Server';
  statusBarItem.command = 'vscode-debugger-mcp.toggleServer';
  statusBarItem.show();

  // Register toggle command
  const toggleServerCommand = vscode.commands.registerCommand('vscode-debugger-mcp.toggleServer', async () => {
    if (sseServer && sseServer.isRunning()) {
      await vscode.commands.executeCommand('vscode-debugger-mcp.stopServer');
    } else {
      await vscode.commands.executeCommand('vscode-debugger-mcp.startServer');
    }
  });

  // Update status bar based on server state
  const updateStatusBar = () => {
    if (sseServer && sseServer.isRunning()) {
      statusBarItem.text = '$(debug-alt) MCP Debug Server (Running)';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground');
    } else {
      statusBarItem.text = '$(debug-alt) MCP Debug Server (Stopped)';
      statusBarItem.backgroundColor = undefined;
    }
  };

  // Set up interval to update status bar
  const statusInterval = setInterval(updateStatusBar, 1000);
  updateStatusBar();

  // Register disposables
  context.subscriptions.push(
    startServerCommand,
    stopServerCommand,
    toggleServerCommand,
    statusBarItem,
    { dispose: () => clearInterval(statusInterval) }
  );

  // Listen for debug session changes
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      outputChannel.appendLine(`Debug session started: ${session.name} (${session.type})`);
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      outputChannel.appendLine(`Debug session terminated: ${session.name}`);
    }),
    vscode.debug.onDidChangeActiveDebugSession((session) => {
      if (session) {
        outputChannel.appendLine(`Active debug session changed: ${session.name}`);
      } else {
        outputChannel.appendLine('No active debug session');
      }
    }),
    vscode.debug.onDidChangeBreakpoints((event) => {
      outputChannel.appendLine(`Breakpoints changed: ${event.added.length} added, ${event.removed.length} removed, ${event.changed.length} changed`);
    })
  );
}

export async function deactivate() {
  if (sseServer) {
    try {
      await sseServer.stop();
      outputChannel.appendLine('SSE server stopped during deactivation');
    } catch (error) {
      outputChannel.appendLine(`Error stopping SSE server during deactivation: ${error}`);
    }
  }
  
  if (outputChannel) {
    outputChannel.dispose();
  }
}