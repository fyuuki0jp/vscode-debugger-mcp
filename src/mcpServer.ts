import * as vscode from 'vscode';
import { DebuggerTools } from './debuggerTools';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPErrorCode,
  MCPTool,
  BreakpointParams,
  EvaluateParams,
  StepParams
} from './types';

export class MCPServer {
  private debuggerTools: DebuggerTools;
  private tools: MCPTool[] = [
    {
      name: 'set_breakpoint',
      description: 'Set a breakpoint at a specific line in a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (absolute or relative to workspace)' },
          line: { type: 'number', description: 'Line number (1-based)' },
          condition: { type: 'string', description: 'Optional breakpoint condition' }
        },
        required: ['path', 'line']
      }
    },
    {
      name: 'remove_breakpoint',
      description: 'Remove a breakpoint at a specific line in a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (absolute or relative to workspace)' },
          line: { type: 'number', description: 'Line number (1-based)' }
        },
        required: ['path', 'line']
      }
    },
    {
      name: 'evaluate_expression',
      description: 'Evaluate an expression in the current debug context',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Expression to evaluate' },
          frameId: { type: 'number', description: 'Optional stack frame ID' }
        },
        required: ['expression']
      }
    },
    {
      name: 'list_debug_configurations',
      description: 'List all available debug configurations from launch.json',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'start_debugging',
      description: 'Start a debugging session',
      inputSchema: {
        type: 'object',
        properties: {
          configName: { type: 'string', description: 'Optional configuration name to use' }
        }
      }
    },
    {
      name: 'stop_debugging',
      description: 'Stop the current debugging session',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'get_debug_status',
      description: 'Get the current debug status including active session, threads, stack frames, and breakpoints',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'step_debugger',
      description: 'Control debugger stepping (step over, step into, step out, continue, pause)',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['stepOver', 'stepInto', 'stepOut', 'continue', 'pause'],
            description: 'Type of step operation' 
          },
          threadId: { type: 'number', description: 'Optional thread ID' }
        },
        required: ['type']
      }
    }
  ];

  constructor(context: vscode.ExtensionContext) {
    this.debuggerTools = new DebuggerTools(context);
  }

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      // Validate request
      if (!request.jsonrpc || request.jsonrpc !== '2.0') {
        return this.createErrorResponse(request.id, MCPErrorCode.InvalidRequest, 'Invalid JSON-RPC version');
      }

      if (!request.method) {
        return this.createErrorResponse(request.id, MCPErrorCode.InvalidRequest, 'Method is required');
      }

      // Route request to appropriate handler
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'tools/list':
          return this.handleToolsList(request);
        case 'tools/call':
          return this.handleToolsCall(request);
        default:
          return this.createErrorResponse(request.id, MCPErrorCode.MethodNotFound, `Method '${request.method}' not found`);
      }
    } catch (error) {
      return this.createErrorResponse(
        request.id, 
        MCPErrorCode.InternalError, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          logging: {}
        },
        serverInfo: {
          name: 'vscode-debugger-mcp',
          version: '0.0.1'
        }
      }
    };
  }

  private handleToolsList(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.tools
      }
    };
  }

  private async handleToolsCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params || {};
    
    if (!name) {
      return this.createErrorResponse(request.id, MCPErrorCode.InvalidParams, 'Tool name is required');
    }

    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      return this.createErrorResponse(request.id, MCPErrorCode.InvalidParams, `Tool '${name}' not found`);
    }

    try {
      let result: any;
      
      switch (name) {
        case 'set_breakpoint':
          const bp = await this.debuggerTools.setBreakpoint(args as BreakpointParams);
          const sourceBp = bp as vscode.SourceBreakpoint;
          result = {
            path: args.path, // Return the path as provided
            line: sourceBp.location.range.start.line + 1,
            enabled: sourceBp.enabled,
            condition: sourceBp.condition
          };
          break;
          
        case 'remove_breakpoint':
          await this.debuggerTools.removeBreakpoint(args as BreakpointParams);
          result = { success: true };
          break;
          
        case 'evaluate_expression':
          result = await this.debuggerTools.evaluateExpression(args as EvaluateParams);
          break;
          
        case 'list_debug_configurations':
          result = await this.debuggerTools.listDebugConfigurations();
          break;
          
        case 'start_debugging':
          await this.debuggerTools.startDebugging(args?.configName);
          result = { success: true };
          break;
          
        case 'stop_debugging':
          await this.debuggerTools.stopDebugging();
          result = { success: true };
          break;
          
        case 'get_debug_status':
          result = await this.debuggerTools.getDebugStatus();
          break;
          
        case 'step_debugger':
          await this.debuggerTools.stepDebugger(args as StepParams);
          result = { success: true };
          break;
          
        default:
          return this.createErrorResponse(request.id, MCPErrorCode.MethodNotFound, `Tool '${name}' not implemented`);
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      return this.createErrorResponse(
        request.id,
        MCPErrorCode.InternalError,
        error instanceof Error ? error.message : 'Tool execution failed'
      );
    }
  }

  private createErrorResponse(id: string | number, code: number, message: string, data?: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
  }
}