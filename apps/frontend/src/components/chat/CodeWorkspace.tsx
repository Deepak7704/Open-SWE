"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import E2BSandbox from "./E2BSandbox";
import GitDiff from "./GitDiff";
import { ExternalLink } from "lucide-react";

interface CodeWorkspaceProps {
  jobId: string;
  status: any;
  isCompleted: boolean;
  prUrl?: string;
}

const CodeWorkspace = ({ jobId, status, isCompleted, prUrl }: CodeWorkspaceProps) => {
  const [activeTab, setActiveTab] = useState("sandbox");

  return (
    <div className="flex-1 p-4 md:p-8 bg-background flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
            <TabsTrigger value="diff">Git Diff</TabsTrigger>
          </TabsList>

          <div className="flex gap-3">
            {isCompleted && prUrl && (
              <Button
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => window.open(prUrl, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Pull Request
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="sandbox" className="flex-1 mt-0">
          <E2BSandbox jobId={jobId} />
        </TabsContent>

        <TabsContent value="diff" className="flex-1 mt-0">
          <GitDiff jobId={jobId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CodeWorkspace;
