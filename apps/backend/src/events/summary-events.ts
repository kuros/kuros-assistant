import { Global, Injectable, Module } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

/**
 * A set of daily summaries that were just written, for one user and usually one day.
 * Producers emit a whole day at once so the knowledge base ingests that day in one pass.
 */
export interface SummariesSavedEvent {
  userId: string;
  summaryIds: string[];
  /** Human source label per summary id (e.g. "#eng-lobby" or "Kuros - Slack"). */
  labels: Record<string, string>;
}

/**
 * In-process bus for "summaries were written". Lets downstream consumers (the
 * knowledge-base ingester) react without ConnectorsModule depending on them.
 */
@Injectable()
export class SummaryEventsService {
  private readonly saved = new Subject<SummariesSavedEvent>();

  get saved$(): Observable<SummariesSavedEvent> {
    return this.saved.asObservable();
  }

  emitSaved(event: SummariesSavedEvent): void {
    if (event.summaryIds.length > 0) this.saved.next(event);
  }
}

@Global()
@Module({
  providers: [SummaryEventsService],
  exports: [SummaryEventsService],
})
export class EventsModule {}
