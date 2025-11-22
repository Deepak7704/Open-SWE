"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import AuthModal from "@/components/AuthModal";

const Hero = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleConnectClick = () => {
    setIsAuthModalOpen(true);
  };

  return (
    <>
      <section className="min-h-screen flex flex-col items-center justify-center px-4 pt-32 pb-20">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl xl:text-9xl mb-12 leading-tight tracking-tight">
            From GitHub Issues to Pull Requests in Seconds
          </h1>

          <Button
            variant="cta"
            size="lg"
            className="rounded-full mb-16"
            onClick={handleConnectClick}
          >
            <Github className="w-5 h-5 mr-2" />
            Connect with GitHub
          </Button>

        <div className="relative w-full max-w-4xl mx-auto">
          {/* Mac window chrome */}
          <div className="bg-white border border-foreground rounded-2xl shadow-2xl overflow-hidden">
            {/* Title bar */}
            <div className="bg-white border-b border-foreground px-4 py-3 flex items-center gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full border border-foreground"></div>
                <div className="w-3 h-3 rounded-full border border-foreground"></div>
                <div className="w-3 h-3 rounded-full border border-foreground"></div>
              </div>
              <div className="flex-1 text-center font-sans text-sm text-foreground font-medium">
                GitHub Issue → Pull Request Demo
              </div>
            </div>

            {/* Window content */}
            <div className="p-6 md:p-8 space-y-6">
              {/* GitHub Issue */}
              <div className="bg-white border border-foreground rounded-xl p-4 md:p-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center font-bold flex-shrink-0 text-xl">
                    !
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-sans text-base md:text-lg font-bold text-foreground mb-2">
                      Critical: Complex Async Error Handling
                    </h3>
                    <p className="font-sans text-xs md:text-sm text-muted-foreground mb-3">
                      Issue #4287 • Opened 2 hours ago
                    </p>
                    <p className="font-sans text-sm text-foreground leading-relaxed">
                      The application crashes when handling multiple concurrent async operations. Need proper error boundaries and retry logic for production stability.
                    </p>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="text-foreground font-sans text-sm font-medium">↓ AI Analysis & Fix ↓</div>
              </div>

              {/* PR Result */}
              <div className="bg-white border border-foreground rounded-xl overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-foreground flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    ✓
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-sans font-bold text-foreground text-sm md:text-base">
                      Fix: Add comprehensive async error handling
                    </h3>
                    <p className="font-sans text-xs md:text-sm text-muted-foreground">
                      Pull Request #4288 • Ready to merge
                    </p>
                  </div>
                </div>
                <div className="p-4 md:p-6 bg-foreground overflow-x-auto">
                  <pre className="font-mono text-xs text-background space-y-1 text-left">
                    <code className="block"><span className="text-green-400">+ try {"{"}</span></code>
                    <code className="block"><span className="text-green-400">+   const results = await Promise.allSettled(operations);</span></code>
                    <code className="block"><span className="text-green-400">+   return results.filter(r =&gt; r.status === &apos;fulfilled&apos;);</span></code>
                    <code className="block"><span className="text-green-400">+ {"}"} catch (error) {"{"}</span></code>
                    <code className="block"><span className="text-green-400">+   await handleError(error, {"{"} retry: true, maxRetries: 3 {"}"});</span></code>
                    <code className="block"><span className="text-green-400">+ {"}"}</span></code>
                  </pre>
                </div>
                <div className="px-4 md:px-6 py-4 border-t border-foreground bg-white">
                  <div className="flex items-center gap-2 text-xs font-sans">
                    <span className="text-green-600">✓</span>
                    <span className="text-foreground">All tests passing • 3 files changed • +47 -12 lines</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
};

export default Hero;
