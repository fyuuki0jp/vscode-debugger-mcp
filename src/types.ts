export interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface BreakpointParams {
  path: string;
  line: number;
  condition?: string;
}

export interface EvaluateParams {
  expression: string;
  frameId?: number;
}

export interface DebugConfiguration {
  name: string;
  type: string;
  request: string;
  [key: string]: any;
}

export interface DebugStatus {
  isActive: boolean;
  isPaused: boolean;
  activeSession?: {
    id: string;
    name: string;
    type: string;
  };
  threads?: {
    id: number;
    name: string;
  }[];
  activeThreadId?: number;
  stackFrames?: {
    id: number;
    name: string;
    source?: {
      path: string;
      name: string;
    };
    line: number;
    column: number;
  }[];
  breakpoints: {
    path: string;
    line: number;
    enabled: boolean;
    condition?: string;
  }[];
}

export enum StepType {
  StepOver = 'stepOver',
  StepInto = 'stepInto',
  StepOut = 'stepOut',
  Continue = 'continue',
  Pause = 'pause'
}

export interface StepParams {
  type: StepType;
  threadId?: number;
}

export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000,
}