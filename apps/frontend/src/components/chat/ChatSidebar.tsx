"use client";

import ChatMessage from "./ChatMessage";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProgressMessage } from "@/lib/progressMessages";
import { Loader2 } from "lucide-react";

interface ChatSidebarProps {
  messages: ProgressMessage[];
  jobId: string;
  isLoading: boolean;
}

const ChatSidebar = ({ messages, jobId, isLoading }: ChatSidebarProps) => {
  return (
    <div className="w-full md:w-[400px] h-full border-r border-border flex flex-col bg-background overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Job Progress</h2>
          {isLoading && messages.length === 0 && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Job ID: {jobId}</p>
      </div>

      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Initializing job...</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                type={message.type}
                content={message.content}
                status={message.status}
                isActive={message.status === 'active'}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
