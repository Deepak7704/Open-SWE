import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import LangGraphFlow from "@/components/LangGraphFlow";


const CodeDemo = () => {
  return (
    <>
      
      

      {/* Code Demo Section */}
      <section className="py-20 md:py-32 px-4 bg-background scroll-mt-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-16">
            {/* Left side - Content */}
            <div className="flex-1 space-y-8 lg:sticky lg:top-24 lg:self-start">
              <h2 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-tight text-foreground">
                Setup in Minutes, Ship in Seconds
              </h2>
              <p className="font-sans text-xl leading-relaxed text-foreground">
                Connect your GitHub repository and let our AI-powered multi-agent system handle the rest.
                Multiple specialized agents analyze, verify, and generate production-ready code with built-in quality checks—ensuring every issue becomes a thoroughly validated pull request automatically.
              </p>
              <div className="flex gap-4">
                <Button
                  variant="cta"
                  size="lg"
                  className="rounded-full"
                >
                  <Github className="w-5 h-5 mr-2" />
                  Connect with GitHub
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full border-foreground hover:bg-foreground hover:text-background"
                >
                  Explore Docs
                </Button>
              </div>
            </div>

            {/* Right side - LangGraph Flow */}
            <LangGraphFlow />
          </div>
        </div>
      </section>
    </>
  );
};

export default CodeDemo;
