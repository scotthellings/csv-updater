import { json } from "@remix-run/node";
import { jobQueue } from "../utils/jobQueue";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  
  if (!jobId) {
    return json({ error: "Job ID is required" }, { status: 400 });
  }

  const job = jobQueue.getJob(parseInt(jobId));
  
  if (!job) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  // Return job status
  return json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    total: job.total,
    processed: job.processed,
    errors: job.errors || [],
    success: job.success || [],
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    format: job.format
  });
};
