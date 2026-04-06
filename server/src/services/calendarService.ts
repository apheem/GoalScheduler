import { google } from 'googleapis';
import { getAuthorizedClient, isConnected, getConnectedCalendars, MAIN_CALENDAR } from './googleAuthService';
import type { CalendarEvent } from './schedulerService';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch events from one or all connected calendars.
 * When personId is omitted, merges events from every connected calendar.
 */
export async function getEventsInRange(
  start: string,
  end: string,
  personId?: string
): Promise<CalendarEvent[]> {
  if (personId) {
    return fetchEventsForPerson(start, end, personId);
  }

  // Merge from all connected calendars
  const connected = await getConnectedCalendars();
  if (!connected.length) return [];

  const results = await Promise.all(connected.map((pid) => fetchEventsForPerson(start, end, pid)));
  const all = results.flat();

  // Deduplicate overlapping windows by sorting and merging
  return all.sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchEventsForPerson(start: string, end: string, personId: string): Promise<CalendarEvent[]> {
  const client = await getAuthorizedClient(personId);
  if (!client) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items ?? [])
      .filter((e) => e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({
        start: e.start!.dateTime!,
        end: e.end!.dateTime!,
      }));
  } catch (err) {
    console.warn(`[calendar] Failed to fetch events for person ${personId}:`, err);
    return [];
  }
}

export async function createEvent(params: {
  summary: string;
  start: string;
  end: string;
  description?: string;
  personId?: string;
}): Promise<string | null> {
  const pid = params.personId ?? MAIN_CALENDAR;
  const client = await getAuthorizedClient(pid);
  if (!client) {
    console.warn(`[calendar] Not connected for person ${pid} — skipping event creation`);
    return null;
  }

  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: params.summary,
      description: params.description ?? 'Scheduled by GoalScheduler',
      start: { dateTime: params.start },
      end: { dateTime: params.end },
    },
  });

  return res.data.id ?? null;
}

export async function updateEvent(params: {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  personId?: string;
}): Promise<void> {
  const client = await getAuthorizedClient(params.personId ?? MAIN_CALENDAR);
  if (!client) return;

  const calendar = google.calendar({ version: 'v3', auth: client });
  const body: Record<string, unknown> = {};
  if (params.summary) body.summary = params.summary;
  if (params.start) body.start = { dateTime: params.start };
  if (params.end) body.end = { dateTime: params.end };

  await calendar.events.patch({
    calendarId: 'primary',
    eventId: params.eventId,
    requestBody: body,
  });
}

export async function deleteEvent(eventId: string, personId?: string): Promise<void> {
  const client = await getAuthorizedClient(personId ?? MAIN_CALENDAR);
  if (!client) return;

  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.delete({ calendarId: 'primary', eventId });
}

export { isConnected };
