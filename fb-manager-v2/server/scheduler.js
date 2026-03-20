// server/scheduler.js — Hệ thống lên lịch chạy tự động cho từng tài khoản

const cron = require('node-cron');

// ─── SCHEDULER MANAGER ────────────────────────────────────────

class SchedulerManager {
  constructor() {
    // jobs[accountId] = { task, config, status, lastRun, nextRun, logs }
    this.jobs   = new Map();
    this.onTick = null; // Callback khi job chạy (set từ index.js)
  }

  /**
   * Tạo hoặc cập nhật lịch cho 1 tài khoản
   * config = {
   *   enabled: true,
   *   timeRanges: [
   *     { from: '08:00', to: '11:00' },
   *     { from: '14:00', to: '17:00' },
   *     { from: '20:00', to: '22:00' },
   *   ],
   *   daysOfWeek: [1,2,3,4,5],   // 0=CN, 1=T2...6=T7
   *   intervalMinutes: 30,        // Chạy mỗi 30 phút trong timeRange
   * }
   */
  setSchedule(accountId, config) {
    // Dừng job cũ nếu có
    this.removeSchedule(accountId);

    if (!config.enabled) {
      this._updateJob(accountId, { config, status: 'disabled', task: null });
      return;
    }

    // Chạy mỗi phút để kiểm tra có trong timeRange không
    const task = cron.schedule('* * * * *', () => {
      this._checkAndRun(accountId, config);
    });

    this._updateJob(accountId, {
      config,
      task,
      status : 'scheduled',
      lastRun: null,
      logs   : [],
    });
  }

  _updateJob(accountId, data) {
    const existing = this.jobs.get(accountId) || {};
    this.jobs.set(accountId, { ...existing, ...data });
  }

  _checkAndRun(accountId, config) {
    const now          = new Date();
    const dayOfWeek    = now.getDay();
    const currentTime  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Kiểm tra ngày trong tuần
    if (config.daysOfWeek && !config.daysOfWeek.includes(dayOfWeek)) return;

    // Kiểm tra có trong timeRange không
    const inRange = (config.timeRanges || []).some(r => {
      return currentTime >= r.from && currentTime <= r.to;
    });
    if (!inRange) return;

    // Kiểm tra đã chạy chưa (theo intervalMinutes)
    const job = this.jobs.get(accountId);
    if (job?.lastRun) {
      const diffMs      = now - new Date(job.lastRun);
      const diffMinutes = diffMs / 1000 / 60;
      if (diffMinutes < (config.intervalMinutes || 30)) return;
    }

    // Cập nhật lastRun và trigger callback
    this._updateJob(accountId, { lastRun: now.toISOString(), status: 'running' });
    this._log(accountId, `⚡ Bắt đầu chạy lúc ${currentTime}`);

    if (this.onTick) {
      this.onTick(accountId, config).then(() => {
        this._updateJob(accountId, { status: 'scheduled' });
        this._log(accountId, `✅ Hoàn thành`);
      }).catch(err => {
        this._updateJob(accountId, { status: 'error' });
        this._log(accountId, `❌ Lỗi: ${err.message}`);
      });
    }
  }

  _log(accountId, message) {
    const job = this.jobs.get(accountId);
    if (!job) return;
    const logs = job.logs || [];
    logs.unshift({ time: new Date().toISOString(), message });
    if (logs.length > 50) logs.splice(50);
    this._updateJob(accountId, { logs });
  }

  removeSchedule(accountId) {
    const job = this.jobs.get(accountId);
    if (job?.task) {
      try { job.task.stop(); } catch {}
    }
    if (job) {
      this._updateJob(accountId, { task: null, status: 'disabled' });
    }
  }

  getStatus(accountId) {
    const job = this.jobs.get(accountId);
    if (!job) return { status: 'not_set', logs: [] };
    return {
      status  : job.status || 'disabled',
      config  : job.config || null,
      lastRun : job.lastRun || null,
      logs    : job.logs || [],
    };
  }

  getAllStatus() {
    const result = {};
    for (const [id, job] of this.jobs) {
      result[id] = {
        status  : job.status || 'disabled',
        config  : job.config || null,
        lastRun : job.lastRun || null,
      };
    }
    return result;
  }

  stopAll() {
    for (const [id] of this.jobs) {
      this.removeSchedule(id);
    }
  }
}

module.exports = new SchedulerManager();