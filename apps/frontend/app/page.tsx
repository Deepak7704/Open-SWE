"use client";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeatureCards from "@/components/FeatureCards";
import CodeDemo from "@/components/CodeDemo";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <Navbar />
      <Hero />
      <FeatureCards />
      <CodeDemo />
      <Footer />
    </div>
  );
}
