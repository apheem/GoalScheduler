import { google } from 'googleapis';
import { db } from '../db';
import { googleTokens } from '../db/schema';
import { eq } from 'drizzle-orm';

export const MAIN_CALENDAR = '__main__';

export function createOAuth2Client() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export function getAuthUrl(personId: string = MAIN_CALENDAR): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: personId,
  });
}

export async function exchangeCode(code: string, personId: string = MAIN_CALENDAR): Promise<void> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  const existing = db.select().from(googleTokens).where(eq(googleTokens.personId, personId)).get();
  if (existing) {
    db.update(googleTokens)
      .set({
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
        expiryDate: tokens.expiry_date ?? null,
      })
      .where(eq(googleTokens.personId, personId))
      .run();
  } else {
    db.insert(googleTokens).values({
      personId,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
    }).run();
  }
}

export async function getAuthorizedClient(personId: string = MAIN_CALENDAR) {
  const stored = db.select().from(googleTokens).where(eq(googleTokens.personId, personId)).get();
  if (!stored?.refreshToken) return null;

  const client = createOAuth2Client();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiryDate,
  });

  client.on('tokens', (tokens) => {
    db.update(googleTokens)
      .set({
        accessToken: tokens.access_token ?? stored.accessToken,
        expiryDate: tokens.expiry_date ?? stored.expiryDate,
      })
      .where(eq(googleTokens.personId, personId))
      .run();
  });

  return client;
}

export function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function isConnected(personId: string = MAIN_CALENDAR): Promise<boolean> {
  const stored = db.select().from(googleTokens).where(eq(googleTokens.personId, personId)).get();
  return !!stored?.refreshToken;
}

/** Returns all personIds (including '__main__') that have a connected calendar. */
export async function getConnectedCalendars(): Promise<string[]> {
  const rows = db.select().from(googleTokens).all();
  return rows.filter((r) => r.refreshToken).map((r) => r.personId);
}
