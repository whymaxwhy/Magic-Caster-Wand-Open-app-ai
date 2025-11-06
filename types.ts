
export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DATA_IN' | 'DATA_OUT';

export interface LogEntry {
  id: number;
  timestamp: string;
  type: LogType;
  message: string;
}

export type VfxCommandType = 'ClearLeds' | 'Buzz' | 'ChangeLed';

export interface VfxCommand {
  id: number;
  type: VfxCommandType;
  params: {
    duration_ms?: number;
    group_id?: number;
    hex_color?: string;
  };
}

export interface OpCodes {
  ClearLeds: number;
  Buzz: number;
  ChangeLed: number;
}
