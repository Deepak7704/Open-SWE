"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const MobileMenu = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-foreground"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 top-[73px] bg-white border-t border-border z-40">
          <div className="flex flex-col gap-6 p-8 font-sans text-lg font-medium">
            <Link
              href="/"
              className="hover:text-muted-foreground transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <a
              href="#about"
              className="hover:text-muted-foreground transition-colors"
              onClick={() => setIsOpen(false)}
            >
              About
            </a>
            <Link
              href="/dashboard"
              className="hover:text-muted-foreground transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Dashboard
            </Link>
            <Button
              variant="cta"
              size="lg"
              className="rounded-full w-full"
            >
              Sign Up
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileMenu;
