// Simple in-memory job queue for CSV processing
// In production, you'd want to use Redis or a proper job queue

class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.currentJobId = 0;
  }

  createJob(type, data) {
    const jobId = ++this.currentJobId;
    const job = {
      id: jobId,
      type,
      status: 'pending',
      progress: 0,
      total: 0,
      processed: 0,
      errors: [],
      success: [],
      data,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null
    };
    
    this.jobs.set(jobId, job);
    console.log(`Created job ${jobId} of type ${type}`);
    return jobId;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(jobId, job);
    }
    return job;
  }

  startJob(jobId) {
    return this.updateJob(jobId, {
      status: 'processing',
      startedAt: new Date()
    });
  }

  completeJob(jobId, results) {
    return this.updateJob(jobId, {
      status: 'completed',
      completedAt: new Date(),
      ...results
    });
  }

  failJob(jobId, error) {
    return this.updateJob(jobId, {
      status: 'failed',
      completedAt: new Date(),
      error: error.message || error
    });
  }

  updateProgress(jobId, progress) {
    return this.updateJob(jobId, progress);
  }

  // Clean up old jobs (older than 1 hour)
  cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.createdAt < oneHourAgo) {
        this.jobs.delete(jobId);
        console.log(`Cleaned up old job ${jobId}`);
      }
    }
  }
}

// Global job queue instance
export const jobQueue = new JobQueue();

// Clean up old jobs every 30 minutes
setInterval(() => {
  jobQueue.cleanup();
}, 30 * 60 * 1000);
