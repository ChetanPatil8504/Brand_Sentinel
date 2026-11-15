import app from './app.js';
import { initDatabase } from './db/connection.js';

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Ensure database tables exist
initDatabase();

app.listen(PORT, HOST, () => {
  console.log(`[Brand Sentinel] API Server running on http://${HOST}:${PORT}`);
  console.log(`[Brand Sentinel] Health endpoint: http://${HOST}:${PORT}/api/health`);
});

