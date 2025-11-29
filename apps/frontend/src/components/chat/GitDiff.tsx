"use client";

import { useState, useEffect } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
}

interface GitDiffProps {
  jobId: string;
}

const GitDiff = ({ jobId }: GitDiffProps) => {
  const [selectedFile, setSelectedFile] = useState(0);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setIsLoading(false);
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    const fetchFileDiffs = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/job-details/${jobId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch file diffs');
        }

        const data = await response.json();
        setFiles(data.fileDiffs || []);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    fetchFileDiffs();
    // Poll for updates every 3 seconds until we have files
    const intervalId = setInterval(() => {
      if (files.length === 0) {
        fetchFileDiffs();
      } else {
        clearInterval(intervalId);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [jobId]);

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

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-2 bg-muted/30">
        <ScrollArea className="w-full">
          <div className="flex gap-2">
            {files.map((file, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedFile(idx)}
                className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
                  selectedFile === idx
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/70"
                }`}
              >
                {file.path}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ScrollArea className="flex-1">
        <Card className="m-4 overflow-hidden border">
          <div className="bg-muted/50 px-4 py-2 border-b">
            <p className="text-sm font-mono">{files[selectedFile].path}</p>
          </div>
          <ReactDiffViewer
            oldValue={files[selectedFile].oldContent}
            newValue={files[selectedFile].newContent}
            splitView={true}
            compareMethod={DiffMethod.WORDS}
            styles={{
              variables: {
                light: {
                  diffViewerBackground: "#ffffff",
                  addedBackground: "#e6ffed",
                  addedColor: "#24292e",
                  removedBackground: "#ffeef0",
                  removedColor: "#24292e",
                  wordAddedBackground: "#acf2bd",
                  wordRemovedBackground: "#fdb8c0",
                  addedGutterBackground: "#cdffd8",
                  removedGutterBackground: "#ffdce0",
                  gutterBackground: "#f6f8fa",
                  gutterBackgroundDark: "#f0f0f0",
                  highlightBackground: "#fffbdd",
                  highlightGutterBackground: "#fff5b1",
                },
              },
              lineNumber: {
                fontSize: "12px",
              },
              contentText: {
                fontSize: "13px",
                fontFamily: "ui-monospace, monospace",
              },
            }}
            useDarkTheme={false}
          />
        </Card>
      </ScrollArea>
    </div>
  );
};

export default GitDiff;
