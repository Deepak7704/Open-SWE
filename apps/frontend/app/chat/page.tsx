"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatSidebar from "@/components/chat/ChatSidebar";
import CodeWorkspace from "@/components/chat/CodeWorkspace";
import { useJobStatus } from "@/hooks/useJobStatus";
import { getProgressMessages } from "@/lib/progressMessages";

function ChatContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const { status, error, isLoading } = useJobStatus(jobId);

  const messages = status
    ? getProgressMessages(status.progress || 0, status.state)
    : [];

  if (!jobId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No job ID provided. Please submit a task from the dashboard.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row pt-20 md:pt-0">
      <ChatSidebar
        messages={messages}
        jobId={jobId}
        isLoading={isLoading}
      />
      <CodeWorkspace
        jobId={jobId}
        status={status}
        isCompleted={status?.state === 'completed'}
        prUrl={status?.result?.prUrl}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
