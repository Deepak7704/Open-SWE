import React from "react";
import { Zap, Target, Brain, Shield, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "From issue to PR in seconds with AI-powered automation",
  },
  {
    icon: Target,
    title: "Precision Testing",
    description: "Every PR validated with comprehensive automated tests",
  },
  {
    icon: Brain,
    title: "Multi-Agent AI",
    description: "Advanced AI orchestrates specialized agents for quality",
  },
  {
    icon: Shield,
    title: "Security First",
    description: "Built-in security checks and vulnerability scanning",
  },
  {
    icon: CheckCircle,
    title: "Production Ready",
    description: "Code that passes all quality gates before merge",
  },
];

const FeatureCards = () => {
  return (
    <section className="py-16 px-6 md:px-12 lg:px-16 bg-background">
      <div className="max-w-[1600px] mx-auto">
        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[180px]">
          {/* Card 1 - Large */}
          <Card className="md:col-span-2 lg:row-span-2 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
            <CardContent className="p-8 h-full flex flex-col justify-between">
              {React.createElement(features[0].icon, { className: "w-14 h-14 mb-4 stroke-[1.5] text-foreground" })}
              <div>
                <h3 className="font-sans text-3xl font-bold mb-3 text-foreground">
                  {features[0].title}
                </h3>
                <p className="font-sans text-lg leading-relaxed text-foreground">
                  {features[0].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2 - Medium */}
          <Card className="md:col-span-1 lg:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              {React.createElement(features[1].icon, { className: "w-10 h-10 mb-3 stroke-[1.5] text-foreground" })}
              <div>
                <h3 className="font-sans text-xl font-bold mb-2 text-foreground">
                  {features[1].title}
                </h3>
                <p className="font-sans text-sm leading-relaxed text-foreground">
                  {features[1].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3 - Medium */}
          <Card className="md:col-span-1 lg:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              {React.createElement(features[2].icon, { className: "w-10 h-10 mb-3 stroke-[1.5] text-foreground" })}
              <div>
                <h3 className="font-sans text-xl font-bold mb-2 text-foreground">
                  {features[2].title}
                </h3>
                <p className="font-sans text-sm leading-relaxed text-foreground">
                  {features[2].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 4 - Small */}
          <Card className="md:col-span-1 lg:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              {React.createElement(features[3].icon, { className: "w-10 h-10 mb-3 stroke-[1.5] text-foreground" })}
              <div>
                <h3 className="font-sans text-xl font-bold mb-2 text-foreground">
                  {features[3].title}
                </h3>
                <p className="font-sans text-sm leading-relaxed text-foreground">
                  {features[3].description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 5 - Small */}
          <Card className="md:col-span-1 lg:row-span-1 bg-white border-foreground shadow-lg hover:shadow-xl transition-shadow rounded-2xl">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              {React.createElement(features[4].icon, { className: "w-10 h-10 mb-3 stroke-[1.5] text-foreground" })}
              <div>
                <h3 className="font-sans text-xl font-bold mb-2 text-foreground">
                  {features[4].title}
                </h3>
                <p className="font-sans text-sm leading-relaxed text-foreground">
                  {features[4].description}
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
