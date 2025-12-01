import React from "react";
import { Target, Brain, Shield, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import ProcessVisualization from "./ProcessVisualization";

const features = [
  {
    icon: Target,
    title: "Precision Testing",
    description: "Automated test generation and validation for every pull request. Our AI analyzes your code changes and creates comprehensive test suites. Ensures code quality with intelligent edge case detection.",
  },
  {
    icon: Brain,
    title: "Multi-Agent AI",
    description: "Advanced orchestration of specialized AI agents working in harmony. Each agent focuses on specific tasks like code analysis, testing, and review. Collaborative intelligence ensures optimal solutions.",
  },
  {
    icon: Shield,
    title: "Security First",
    description: "Built-in vulnerability scanning and security checks on every commit. Automatically detects potential security risks in dependencies and code. Provides actionable recommendations to fix issues instantly.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "From issue detection to pull request in seconds, not hours. AI-powered automation handles the entire development workflow seamlessly. Reduces manual coding time by up to 80% with intelligent suggestions.",
  },
];

const FeatureCards = () => {
  return (
    <section className="py-8 md:py-16 px-4 md:px-8 lg:px-12 bg-background">
      <div className="max-w-[1600px] mx-auto">
        {/* Mobile View - Stacked */}
        <div className="block md:hidden space-y-4">
          {/* Process Visualization - Full Width on Mobile */}
          <div className="w-full flex items-center justify-center py-8">
            <ProcessVisualization />
          </div>

          {/* Feature Cards - Stacked on Mobile */}
          {features.map((feature, index) => (
            <Card key={index} className="bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
              <CardContent className="p-6 flex flex-col">
                {React.createElement(feature.icon, { className: "w-12 h-12 mb-4 stroke-[1.5] text-foreground" })}
                <div>
                  <h3 className="font-sans text-xl font-bold mb-2 text-foreground">
                    {feature.title}
                  </h3>
                  <p className="font-sans text-sm leading-relaxed text-foreground">
                    {feature.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop View - Bento Grid */}
        {/* FIXED: Reduced row height to 240px/260px for better fit */}
        <div className="hidden md:grid md:grid-cols-4 gap-4 md:auto-rows-[240px] lg:auto-rows-[260px]">
          {/* Process Visualization */}
          <div className="md:col-span-2 md:row-span-2 flex items-center justify-center">
            <ProcessVisualization />
          </div>

          {/* Card 1 - Top Right */}
          <Card className="md:col-span-1 md:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl overflow-hidden">
            <CardContent className="p-4 lg:p-5 h-full flex flex-col">
              {React.createElement(features[0].icon, { className: "w-10 h-10 lg:w-12 lg:h-12 mb-2 lg:mb-3 stroke-[1.5] text-foreground flex-shrink-0" })}
              <div className="flex-1 flex flex-col">
                <h3 className="font-sans text-lg lg:text-xl font-bold mb-1.5 lg:mb-2 text-foreground">
                  {features[0].title}
                </h3>
                <p className="font-sans text-xs lg:text-sm leading-relaxed text-foreground overflow-y-auto">
                  {features[0].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 - Top Far Right */}
          <Card className="md:col-span-1 md:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl overflow-hidden">
            <CardContent className="p-4 lg:p-5 h-full flex flex-col">
              {React.createElement(features[1].icon, { className: "w-10 h-10 lg:w-12 lg:h-12 mb-2 lg:mb-3 stroke-[1.5] text-foreground flex-shrink-0" })}
              <div className="flex-1 flex flex-col">
                <h3 className="font-sans text-lg lg:text-xl font-bold mb-1.5 lg:mb-2 text-foreground">
                  {features[1].title}
                </h3>
                <p className="font-sans text-xs lg:text-sm leading-relaxed text-foreground overflow-y-auto">
                  {features[1].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3 - Bottom Right */}
          <Card className="md:col-span-1 md:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl overflow-hidden">
            <CardContent className="p-4 lg:p-5 h-full flex flex-col">
              {React.createElement(features[2].icon, { className: "w-10 h-10 lg:w-12 lg:h-12 mb-2 lg:mb-3 stroke-[1.5] text-foreground flex-shrink-0" })}
              <div className="flex-1 flex flex-col">
                <h3 className="font-sans text-lg lg:text-xl font-bold mb-1.5 lg:mb-2 text-foreground">
                  {features[2].title}
                </h3>
                <p className="font-sans text-xs lg:text-sm leading-relaxed text-foreground overflow-y-auto">
                  {features[2].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 4 - Bottom Far Right */}
          <Card className="md:col-span-1 md:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl overflow-hidden">
            <CardContent className="p-4 lg:p-5 h-full flex flex-col">
              {React.createElement(features[3].icon, { className: "w-10 h-10 lg:w-12 lg:h-12 mb-2 lg:mb-3 stroke-[1.5] text-foreground flex-shrink-0" })}
              <div className="flex-1 flex flex-col">
                <h3 className="font-sans text-lg lg:text-xl font-bold mb-1.5 lg:mb-2 text-foreground">
                  {features[3].title}
                </h3>
                <p className="font-sans text-xs lg:text-sm leading-relaxed text-foreground overflow-y-auto">
                  {features[3].description}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default FeatureCards;
