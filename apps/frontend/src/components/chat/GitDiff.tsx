"use client";

import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileCode } from "lucide-react";

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  diffOutput?: string;
}

interface GitDiffProps {
  jobId: string;
  token: string | null;
}

const GitDiff = ({ jobId, token }: GitDiffProps) => {
  const [selectedFile, setSelectedFile] = useState(0);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !token) {
      setIsLoading(false);
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    let intervalId: NodeJS.Timeout | null = null;

    const fetchFileDiffs = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/job-details/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch file diffs');
        }

        const data = await response.json();
        setFiles(data.fileDiffs || []);
        setIsLoading(false);

        // Stop polling when job is completed or failed
        if (data.state === 'completed' || data.state === 'failed') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchFileDiffs();

    // Poll for updates every 3 seconds
    intervalId = setInterval(fetchFileDiffs, 3000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobId, token]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-600 text-sm">Error: {error}</p>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">No changes to display yet. Changes will appear here once code generation is complete.</p>
      </div>
    );
  }

  const renderUnifiedDiff = (diffOutput: string) => {
    if (!diffOutput) {
      return (
        <div className="p-4 text-muted-foreground text-sm">
          No diff output available
        </div>
      );
    }

    const lines = diffOutput.split('\n');

    return (
      <div className="font-mono text-xs bg-background">
        {lines.map((line, idx) => {
          let bgColor = '';
          let textColor = 'text-foreground';
          let linePrefix = '';

          if (line.startsWith('+')) {
            bgColor = 'bg-green-50 dark:bg-green-950/30';
            textColor = 'text-green-700 dark:text-green-400';
            linePrefix = '+';
          } else if (line.startsWith('-')) {
            bgColor = 'bg-red-50 dark:bg-red-950/30';
            textColor = 'text-red-700 dark:text-red-400';
            linePrefix = '-';
          } else if (line.startsWith('@@')) {
            bgColor = 'bg-blue-50 dark:bg-blue-950/30';
            textColor = 'text-blue-700 dark:text-blue-400';
          } else if (line.startsWith('diff --git') || line.startsWith('index') ||
                     line.startsWith('---') || line.startsWith('+++') ||
                     line.startsWith('new file') || line.startsWith('deleted file')) {
            bgColor = 'bg-muted/50';
            textColor = 'text-muted-foreground';
          }

          return (
            <div
              key={idx}
              className={`px-4 py-0.5 ${bgColor} ${textColor} hover:bg-opacity-80 transition-colors`}
            >
              <span className="select-none text-muted-foreground mr-4 inline-block w-8 text-right">
                {idx + 1}
              </span>
              <span className="whitespace-pre">{line || ' '}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-3 bg-muted/30">
        <div className="flex items-center gap-3">
          <FileCode className="w-4 h-4 text-muted-foreground" />
          <Select
            value={selectedFile.toString()}
            onValueChange={(value: string) => setSelectedFile(parseInt(value))}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue>
                <span className="font-mono text-sm">{files[selectedFile].path}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {files.map((file, idx) => (
                <SelectItem key={idx} value={idx.toString()}>
                  <span className="font-mono text-sm">{file.path}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {selectedFile + 1} of {files.length}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Card className="m-4 overflow-hidden border">
          <div className="bg-muted/50 px-4 py-2 border-b">
            <p className="text-sm font-mono">{files[selectedFile].path}</p>
          </div>
          <div className="overflow-x-auto">
            {renderUnifiedDiff(files[selectedFile].diffOutput || '')}
          </div>
        </Card>
      </ScrollArea>
    </div>
  );
};

export default GitDiff;
