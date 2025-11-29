"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
}

const ChatInput = ({ onSend }: ChatInputProps) => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative">
        <Pencil className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can I help?"
          className="pl-12 rounded-full border-foreground focus:border-blue-500 placeholder:text-blue-500"
        />
      </div>
    </form>
  );
};

export default ChatInput;
