// src/types/agent.ts

export type AgentMessageRole = 'user' | 'assistant';

export type AgentSessionStatus = 'idle' | 'generating' | 'error';

// Firestore timestamp shape — compatible with both client + admin SDK.
export interface FirestoreTimestamp {
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
}

// Subcollection document.
// Path: users/{businessId}/agent_sessions/{sessionId}/messages/{messageId}
export interface AgentMessage {
  id: string;                  // mirrors the doc ID
  role: AgentMessageRole;
  content: string;
  createdAt: FirestoreTimestamp;
}

// Session document.
// Path: users/{businessId}/agent_sessions/{sessionId}
// Rule: no optional fields — every field is always present, nullable fields are T | null.
export interface AgentSession {
  sessionId: string;           // mirrors the doc ID
  businessId: string;
  status: AgentSessionStatus;
  generatingStartedAt: FirestoreTimestamp | null; // null when status is idle/error
  createdAt: FirestoreTimestamp;
  endedAt: FirestoreTimestamp | null;
  lastActivityAt: FirestoreTimestamp;
}