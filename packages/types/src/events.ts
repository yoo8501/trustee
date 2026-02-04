// 이벤트 타입 정의

export interface BaseEvent {
  eventId: string;
  timestamp: string;
  source: string;
}

// 수탁사 이벤트
export interface TrusteeCreatedEvent extends BaseEvent {
  type: "trustee.created";
  data: {
    id: string;
    companyName: string;
    businessNumber: string;
  };
}

export interface TrusteeUpdatedEvent extends BaseEvent {
  type: "trustee.updated";
  data: {
    id: string;
    companyName: string;
    changes: string[];
  };
}

export interface TrusteeDeletedEvent extends BaseEvent {
  type: "trustee.deleted";
  data: {
    id: string;
    companyName: string;
  };
}

export type TrusteeEvent =
  | TrusteeCreatedEvent
  | TrusteeUpdatedEvent
  | TrusteeDeletedEvent;

// 점검 이벤트
export interface InspectionCreatedEvent extends BaseEvent {
  type: "inspection.created";
  data: {
    id: string;
    trusteeId: string;
    inspectionDate: string;
  };
}

export interface InspectionCompletedEvent extends BaseEvent {
  type: "inspection.completed";
  data: {
    id: string;
    trusteeId: string;
    score: number | null;
    status: string;
  };
}

export interface InspectionCancelledEvent extends BaseEvent {
  type: "inspection.cancelled";
  data: {
    id: string;
    trusteeId: string;
    reason: string;
  };
}

export type InspectionEvent =
  | InspectionCreatedEvent
  | InspectionCompletedEvent
  | InspectionCancelledEvent;

export type DomainEvent = TrusteeEvent | InspectionEvent;

// 이벤트 라우팅 키
export const EVENT_ROUTING_KEYS = {
  TRUSTEE_CREATED: "trustee.created",
  TRUSTEE_UPDATED: "trustee.updated",
  TRUSTEE_DELETED: "trustee.deleted",
  INSPECTION_CREATED: "inspection.created",
  INSPECTION_COMPLETED: "inspection.completed",
  INSPECTION_CANCELLED: "inspection.cancelled",
} as const;

export const EXCHANGE_NAME = "trustee.events";
