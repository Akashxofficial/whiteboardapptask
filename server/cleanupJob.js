// server/cleanupJob.js
import cron from 'node-cron';
import Room from './models/Room.js';

export function startCleanupJob() {

  cron.schedule('0 0 * * *', async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const result = await Room.deleteMany({ lastActivity: { $lt: cutoff } });

    console.log(`🧹 Cleaned up ${result.deletedCount} inactive rooms`);
  });
}
