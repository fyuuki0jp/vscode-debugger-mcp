import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BreakpointParams, EvaluateParams, DebugConfiguration, DebugStatus, StepParams, StepType } from './types';

export class DebuggerTools {
  constructor(_context: vscode.ExtensionContext) {
    // Context may be used in future implementations
  }

  async setBreakpoint(params: BreakpointParams): Promise<vscode.Breakpoint> {
    const absolutePath = this.resolveFilePath(params.path);
    const uri = vscode.Uri.file(absolutePath);
    const location = new vscode.SourceBreakpoint(
      new vscode.Location(uri, new vscode.Position(params.line - 1, 0)),
      true,
      params.condition
    );
    
    vscode.debug.addBreakpoints([location]);
    return location;
  }

  async removeBreakpoint(params: BreakpointParams): Promise<void> {
    const absolutePath = this.resolveFilePath(params.path);
    const breakpoints = vscode.debug.breakpoints;
    const toRemove = breakpoints.filter(bp => {
      if (bp instanceof vscode.SourceBreakpoint) {
        const location = bp.location;
        return location.uri.fsPath === absolutePath && 
               location.range.start.line === params.line - 1;
      }
      return false;
    });
    
    if (toRemove.length > 0) {
      vscode.debug.removeBreakpoints(toRemove);
    }
  }

  async evaluateExpression(params: EvaluateParams): Promise<string> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      throw new Error('No active debug session');
    }

    try {
      const response = await session.customRequest('evaluate', {
        expression: params.expression,
        frameId: params.frameId,
        context: 'repl'
      });
      
      return response.result || 'undefined';
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${error}`);
    }
  }

  async listDebugConfigurations(): Promise<DebugConfiguration[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const configurations: DebugConfiguration[] = [];
    
    for (const folder of workspaceFolders) {
      const launchPath = path.join(folder.uri.fsPath, '.vscode', 'launch.json');
      
      if (fs.existsSync(launchPath)) {
        try {
          const content = fs.readFileSync(launchPath, 'utf8');
          const launchConfig = JSON.parse(content);
          
          if (launchConfig.configurations && Array.isArray(launchConfig.configurations)) {
            configurations.push(...launchConfig.configurations);
          }
        } catch (error) {
          console.error(`Failed to parse launch.json in ${folder.name}: ${error}`);
        }
      }
    }

    // Also include configurations from settings
    const workspaceConfig = vscode.workspace.getConfiguration('launch');
    const settingsConfigs = workspaceConfig.get<DebugConfiguration[]>('configurations', []);
    configurations.push(...settingsConfigs);

    return configurations;
  }

  async startDebugging(configName?: string): Promise<void> {
    const configurations = await this.listDebugConfigurations();
    
    if (configName) {
      const config = configurations.find(c => c.name === configName);
      if (!config) {
        throw new Error(`Debug configuration '${configName}' not found`);
      }
      
      const folder = vscode.workspace.workspaceFolders?.[0];
      await vscode.debug.startDebugging(folder, config);
    } else {
      // Start with the first available configuration
      if (configurations.length > 0) {
        const folder = vscode.workspace.workspaceFolders?.[0];
        await vscode.debug.startDebugging(folder, configurations[0]);
      } else {
        throw new Error('No debug configurations found');
      }
    }
  }

  async stopDebugging(): Promise<void> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      throw new Error('No active debug session');
    }
    
    await vscode.debug.stopDebugging(session);
  }

  async getDebugStatus(): Promise<DebugStatus> {
    const session = vscode.debug.activeDebugSession;
    const breakpoints = vscode.debug.breakpoints
      .filter(bp => bp instanceof vscode.SourceBreakpoint)
      .map(bp => {
        const sourceBreakpoint = bp as vscode.SourceBreakpoint;
        return {
          path: this.getRelativePath(sourceBreakpoint.location.uri.fsPath),
          line: sourceBreakpoint.location.range.start.line + 1,
          enabled: sourceBreakpoint.enabled,
          condition: sourceBreakpoint.condition
        };
      });

    let threads: { id: number; name: string }[] | undefined;
    let activeThreadId: number | undefined;
    let stackFrames: any[] | undefined;

    if (session) {
      try {
        // Get threads
        const threadsResponse = await session.customRequest('threads');
        threads = threadsResponse.threads || [];
        
        // For single-threaded debuggers, create a default thread
        if (!threads || threads.length === 0) {
          threads = [{ id: 1, name: 'main' }];
        }
        
        // Get the first thread as active if available
        if (threads && threads.length > 0) {
          activeThreadId = threads[0].id;
        }
        
        // Try to get stack trace for the active thread
        try {
          const stackTraceResponse = await session.customRequest('stackTrace', {
            threadId: activeThreadId,
            startFrame: 0,
            levels: 20
          });
          
          if (stackTraceResponse && stackTraceResponse.stackFrames) {
            stackFrames = stackTraceResponse.stackFrames.map((frame: any) => ({
              id: frame.id,
              name: frame.name,
              source: frame.source ? {
                path: frame.source.path ? this.getRelativePath(frame.source.path) : undefined,
                name: frame.source.name
              } : undefined,
              line: frame.line,
              column: frame.column
            }));
          }
        } catch (e) {
          // Stack trace might not be available if not paused
          // This is normal when the debugger is running
        }
      } catch (error: any) {
        // Some debug adapters might not support threads
        // Provide a default thread in this case
        threads = [{ id: 1, name: 'main' }];
        activeThreadId = 1;
        
        // Log error for debugging purposes
        if (error.message && !error.message.includes('not supported')) {
          console.error('Failed to get thread information:', error.message);
        }
      }
    }

    return {
      isActive: !!session,
      isPaused: stackFrames !== undefined, // If we can get stack frames, we're paused
      activeSession: session ? {
        id: session.id,
        name: session.name,
        type: session.type
      } : undefined,
      threads,
      activeThreadId,
      stackFrames,
      breakpoints
    };
  }

  async stepDebugger(params: StepParams): Promise<void> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      throw new Error('No active debug session');
    }

    // If no threadId specified, try to get the active thread
    let threadId = params.threadId;
    if (!threadId) {
      try {
        const threadsResponse = await session.customRequest('threads');
        if (threadsResponse.threads && threadsResponse.threads.length > 0) {
          threadId = threadsResponse.threads[0].id;
        } else {
          threadId = 1; // Default to thread 1
        }
      } catch {
        threadId = 1; // Default to thread 1 if threads not supported
      }
    }

    switch (params.type) {
      case StepType.StepOver:
        await session.customRequest('next', { threadId });
        break;
      case StepType.StepInto:
        await session.customRequest('stepIn', { threadId });
        break;
      case StepType.StepOut:
        await session.customRequest('stepOut', { threadId });
        break;
      case StepType.Continue:
        await session.customRequest('continue', { threadId });
        break;
      case StepType.Pause:
        await session.customRequest('pause', { threadId });
        break;
      default:
        throw new Error(`Unknown step type: ${params.type}`);
    }
  }

  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }
    
    // Try to resolve relative to the first workspace folder
    return path.join(workspaceFolders[0].uri.fsPath, filePath);
  }

  private getRelativePath(absolutePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return absolutePath;
    }
    
    // Try to make path relative to workspace folder
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      if (absolutePath.startsWith(folderPath)) {
        return path.relative(folderPath, absolutePath);
      }
    }
    
    return absolutePath;
  }
}