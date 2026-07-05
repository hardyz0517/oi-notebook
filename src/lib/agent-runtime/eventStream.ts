import type { AgentEvent } from "./agentTypes";

export type EventStream = {
  push(event: AgentEvent): void;
  snapshot(): AgentEvent[];
  flush(): AgentEvent[];
};

export function createEventStream(): EventStream {
  const events: AgentEvent[] = [];

  return {
    push(event: AgentEvent): void {
      events.push(event);
    },
    snapshot(): AgentEvent[] {
      return [...events];
    },
    flush(): AgentEvent[] {
      const flushed = [...events];
      events.length = 0;
      return flushed;
    },
  };
}
