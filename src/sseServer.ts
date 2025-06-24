import express from 'express';
import cors from 'cors';
import * as http from 'http';
import * as vscode from 'vscode';
import { MCPServer } from './mcpServer';
import { MCPRequest, MCPResponse } from './types';

export class SSEServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private mcpServer: MCPServer;
  private clients: Set<express.Response> = new Set();
  private outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext) {
    this.app = express();
    this.mcpServer = new MCPServer(context);
    this.outputChannel = vscode.window.createOutputChannel('VSCode Debugger MCP');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.text());
  }

  private setupRoutes(): void {
    // SSE endpoint
    this.app.get('/sse', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Send initial connection event
      res.write('event: connected\ndata: {"type": "connected"}\n\n');

      // Add client to set
      this.clients.add(res);
      this.outputChannel.appendLine(`Client connected. Total clients: ${this.clients.size}`);

      // Handle client disconnect
      req.on('close', () => {
        this.clients.delete(res);
        this.outputChannel.appendLine(`Client disconnected. Total clients: ${this.clients.size}`);
      });
    });

    // MCP request endpoint
    this.app.post('/sse', async (req, res) => {
      try {
        let request: MCPRequest;
        
        // Handle both JSON and text content types
        if (typeof req.body === 'string') {
          try {
            request = JSON.parse(req.body);
          } catch (e) {
            res.status(400).json({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32700,
                message: 'Parse error'
              }
            });
            return;
          }
        } else {
          request = req.body;
        }

        this.outputChannel.appendLine(`Received request: ${JSON.stringify(request, null, 2)}`);

        // Process request with MCP server
        const response = await this.mcpServer.handleRequest(request);
        
        this.outputChannel.appendLine(`Sending response: ${JSON.stringify(response, null, 2)}`);

        // Send response to all connected SSE clients
        this.broadcast(response);

        // Also send response back to POST request
        res.json(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.outputChannel.appendLine(`Error handling request: ${errorMessage}`);
        
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: errorMessage
          }
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        clients: this.clients.size,
        timestamp: new Date().toISOString()
      });
    });
  }

  private broadcast(data: MCPResponse): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    this.clients.forEach(client => {
      try {
        client.write(message);
      } catch (error) {
        this.outputChannel.appendLine(`Error broadcasting to client: ${error}`);
        this.clients.delete(client);
      }
    });
  }

  async start(port: number = 6010): Promise<void> {
    if (this.server) {
      this.outputChannel.appendLine('SSE server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          this.outputChannel.appendLine(`SSE server started on http://localhost:${port}/sse`);
          this.outputChannel.show();
          resolve();
        });

        this.server.on('error', (error) => {
          this.outputChannel.appendLine(`Failed to start SSE server: ${error}`);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all SSE connections
      this.clients.forEach(client => {
        try {
          client.end();
        } catch (error) {
          // Ignore errors during cleanup
        }
      });
      this.clients.clear();

      // Stop the server
      this.server!.close(() => {
        this.server = null;
        this.outputChannel.appendLine('SSE server stopped');
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}