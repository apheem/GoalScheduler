import { Router } from 'express';
import {
  getAuthUrl,
  exchangeCode,
  isConnected,
  isConfigured,
  getConnectedCalendars,
  MAIN_CALENDAR,
} from '../services/googleAuthService';

const router = Router();

// GET /api/auth/status?personId=xxx  (omit personId for main user)
router.get('/status', async (req, res) => {
  const personId = (req.query.personId as string) || MAIN_CALENDAR;
  res.json({
    configured: isConfigured(),
    connected: await isConnected(personId),
  });
});

// GET /api/auth/connections — all personIds (including '__main__') with a connected calendar
router.get('/connections', async (req, res) => {
  const connected = await getConnectedCalendars();
  res.json(connected);
});

// GET /api/auth/google?personId=xxx — redirect to Google consent screen
router.get('/google', (req, res) => {
  if (!isConfigured()) {
    return res.redirect('http://localhost:5173/setup?error=missing_credentials');
  }
  const personId = (req.query.personId as string) || MAIN_CALENDAR;
  res.redirect(getAuthUrl(personId));
});

// GET /api/auth/google/callback — Google redirects back here
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const personId = (req.query.state as string) || MAIN_CALENDAR;

  if (!code) {
    return res.redirect('http://localhost:5173/setup?error=no_code');
  }
  try {
    await exchangeCode(code, personId);
    const extra = personId !== MAIN_CALENDAR ? `&personId=${encodeURIComponent(personId)}` : '';
    res.redirect(`http://localhost:5173/setup?connected=true${extra}`);
  } catch (err) {
    console.error('[auth] OAuth error:', err);
    res.redirect('http://localhost:5173/setup?error=oauth_failed');
  }
});

export default router;
