import { Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  type: "issue" | "task" | "user" | "ai";
  content: string;
  status: "complete" | "active" | "pending";
  isActive?: boolean;
}

const ChatMessage = ({ type, content, status, isActive }: ChatMessageProps) => {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-background transition-all",
        isActive && "border-blue-500 bg-blue-50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {status === "complete" ? (
            <CircleDot className="w-5 h-5 text-foreground" />
          ) : (
            <Circle className="w-5 h-5 text-foreground" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
