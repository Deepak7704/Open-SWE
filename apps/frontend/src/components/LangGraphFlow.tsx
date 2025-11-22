import { ArrowDown, Code, Shield, TestTube, CheckCircle } from "lucide-react";

const LangGraphFlow = () => {
  return (
    <div className="flex-1 space-y-6">
      <h3 className="font-serif text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground mb-8">
        Multi-Agent Quality Assurance
      </h3>

      <div className="space-y-4">
        {/* Code Agent */}
        <div className="bg-white border border-foreground rounded-xl p-6 transition-all hover:shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0">
              <Code className="w-6 h-6 text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <h4 className="font-sans text-lg font-bold text-foreground mb-2">
                Code Agent
              </h4>
              <p className="font-sans text-sm text-muted-foreground">
                Analyzes repository structure, understands context, and generates production-ready code with best practices.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-foreground" />
        </div>

        {/* Test Agent */}
        <div className="bg-white border border-foreground rounded-xl p-6 transition-all hover:shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0">
              <TestTube className="w-6 h-6 text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <h4 className="font-sans text-lg font-bold text-foreground mb-2">
                Test Agent
              </h4>
              <p className="font-sans text-sm text-muted-foreground">
                Validates functionality, runs comprehensive tests, and ensures code reliability before deployment.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-foreground" />
        </div>

        {/* Security Agent */}
        <div className="bg-white border border-foreground rounded-xl p-6 transition-all hover:shadow-lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <h4 className="font-sans text-lg font-bold text-foreground mb-2">
                Security Agent
              </h4>
              <p className="font-sans text-sm text-muted-foreground">
                Reviews for vulnerabilities, checks dependencies, and ensures secure implementation patterns.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-foreground" />
        </div>

        {/* Review Complete */}
        <div className="bg-foreground text-background rounded-xl p-6">
          <div className="flex items-center gap-4">
            <CheckCircle className="w-12 h-12 flex-shrink-0" />
            <div className="flex-1 text-left">
              <h4 className="font-sans text-lg font-bold mb-2">
                Multi-Checkpoint Verification Complete
              </h4>
              <p className="font-sans text-sm opacity-90">
                All agents pass validation. Ready for your review and acceptance.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted border border-border rounded-xl p-6 mt-8">
        <p className="font-sans text-sm text-foreground">
          <strong>Powered by Advanced AI:</strong> Our orchestration engine coordinates specialized agents through multiple validation checkpoints, ensuring every solution meets production standards before reaching you.
        </p>
      </div>
    </div>
  );
};

export default LangGraphFlow;
