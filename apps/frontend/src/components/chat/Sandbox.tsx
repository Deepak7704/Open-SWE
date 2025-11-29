"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2, Terminal, CheckCircle2, Circle } from "lucide-react";

interface SandboxProps {
  jobId: string;
}

interface LogEntry {
  type: "output" | "error" | "command" | "success" | "info";
  content: string;
  timestamp: Date;
}

const progressSteps = [
  { progress: 10, message: "Creating isolated E2B sandbox environment..." },
  { progress: 20, message: "Cloning repository and setting up workspace..." },
  { progress: 30, message: "Detecting package manager and dependencies..." },
  { progress: 40, message: "Searching for relevant files using hybrid search (BM25 + Vector)..." },
  { progress: 50, message: "Building code graph and analyzing dependencies..." },
  { progress: 60, message: "Selecting files to modify based on your task..." },
  { progress: 70, message: "Generating code changes with AI..." },
  { progress: 80, message: "Running validation checks (syntax, types)..." },
  { progress: 90, message: "Validating code changes and running tests..." },
  { progress: 95, message: "Committing changes and creating pull request..." },
  { progress: 100, message: "Pull request created successfully!" },
];

const E2BSandbox = ({ jobId }: SandboxProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      type: "info",
      content: `Job ID: ${jobId}`,
      timestamp: new Date(),
    },
    {
      type: "output",
      content: "Initializing E2B sandbox environment...",
      timestamp: new Date(),
    },
  ]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [jobState, setJobState] = useState<string>("waiting");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastProgressRef = useRef(0);
  const prUrlAddedRef = useRef(false);
  const errorAddedRef = useRef(false);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (!jobId) return;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    let intervalId: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/status/${jobId}`);
        if (!response.ok) return;

        const data = await response.json();
        const progress = data.progress || 0;
        const state = data.state;

        setCurrentProgress(progress);
        setJobState(state);

        // Add new log entries based on progress milestones
        progressSteps.forEach((step) => {
          if (progress >= step.progress && lastProgressRef.current < step.progress) {
            setLogs((prevLogs) => [
              ...prevLogs,
              {
                type: progress === 100 ? "success" : "output",
                content: step.message,
                timestamp: new Date(),
              },
            ]);
          }
        });

        lastProgressRef.current = progress;

        // Add completion or error log (only once)
        if (state === 'completed' && progress === 100) {
          if (data.result?.prUrl && !prUrlAddedRef.current) {
            prUrlAddedRef.current = true;
            setLogs((prevLogs) => [
              ...prevLogs,
              {
                type: "success",
                content: `✓ PR created: ${data.result.prUrl}`,
                timestamp: new Date(),
              },
            ]);
          }
          // Stop polling once completed
          clearInterval(intervalId);
        } else if (state === 'failed') {
          if (!errorAddedRef.current) {
            errorAddedRef.current = true;
            setLogs((prevLogs) => [
              ...prevLogs,
              {
                type: "error",
                content: `✗ Job failed: ${data.result?.error || 'Unknown error'}`,
                timestamp: new Date(),
              },
            ]);
          }
          // Stop polling once failed
          clearInterval(intervalId);
        }
      } catch (error) {
        // Silently fail - we'll retry on next poll
      }
    };

    // Initial fetch
    fetchJobStatus();

    // Poll every 2 seconds
    intervalId = setInterval(fetchJobStatus, 2000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobId]);

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 m-4 overflow-hidden border flex flex-col">
        <div className="bg-muted/50 px-4 py-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            <p className="text-sm font-mono">E2B Sandbox Terminal</p>
          </div>
          <div className="flex items-center gap-2">
            {jobState === 'active' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-xs text-muted-foreground">Progress: {currentProgress}%</span>
              </>
            )}
            {jobState === 'completed' && (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-600">Completed</span>
              </>
            )}
            {jobState === 'failed' && (
              <span className="text-xs text-red-600">Failed</span>
            )}
            {jobState === 'waiting' && (
              <span className="text-xs text-muted-foreground">Waiting...</span>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="font-mono text-sm space-y-2">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 ${
                  log.type === "error"
                    ? "text-red-600"
                    : log.type === "success"
                    ? "text-green-600 font-semibold"
                    : log.type === "command"
                    ? "text-blue-600"
                    : log.type === "info"
                    ? "text-purple-600"
                    : "text-foreground"
                }`}
              >
                <span className="text-muted-foreground text-xs min-w-[70px]">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className="flex-1">{log.content}</span>
              </div>
            ))}
            {jobState === 'active' && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <div>
                  <strong>Active:</strong> Sandbox is running and will remain available for 30 minutes after completion.
                </div>
              </div>
            )}
            {jobState === 'completed' && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <div>
                  <strong>Complete:</strong> Sandbox will remain active for 30 minutes for review and testing.
                </div>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};

export default E2BSandbox;
