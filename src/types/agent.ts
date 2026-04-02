// src/types/agent.ts
//
// Shared types for the Majime Agent session system.
// Timestamp is structurally typed to be compatible with both
// Firebase client SDK (firebase/firestore) and Admin SDK (firebase-admin/firestore).

export type AgentMessageRole = 'user' | 'assistant';

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: {
    toDate(): Date;
    seconds: number;
    nanoseconds: number;
  };
}

export type AgentSessionStatus = 'active' | 'ended';

// Firestore document structure.
// Path: users/{businessId}/agent_sessions/{sessionId}
// Rule: no optional fields — every field is always present, nullable fields are `T | null`.
export interface AgentSession {
  sessionId: string; // mirrors the doc ID
  businessId: string;
  status: AgentSessionStatus;
  createdAt: {
    toDate(): Date;
    seconds: number;
    nanoseconds: number;
  };
  endedAt: {
    toDate(): Date;
    seconds: number;
    nanoseconds: number;
  } | null;
  lastActivityAt: {
    toDate(): Date;
    seconds: number;
    nanoseconds: number;
  };
  messages: AgentMessage[];
}