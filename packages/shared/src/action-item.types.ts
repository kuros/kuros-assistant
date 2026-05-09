export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';

export interface ActionItemDto {
  id: string;
  sourceSummaryId: string | null;
  title: string;
  detail: string | null;
  dueDate: string | null;
  status: ActionItemStatus;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemsQuery {
  status?: ActionItemStatus | ActionItemStatus[];
  from?: string;
  to?: string;
}

export interface UpdateActionItemRequest {
  status?: ActionItemStatus;
  dueDate?: string | null;
}
