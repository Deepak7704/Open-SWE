"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import octopusLogo from "@/assets/octopus.png";
import MobileMenu from "@/components/MobileMenu";
import Image from "next/image";
import { useEffect, useState } from "react";

const Navbar = () => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const heroSection = document.querySelector('section');
      const heroHeight = heroSection?.offsetHeight || 600;
      
      const scrolled = window.scrollY;
      const progress = Math.min(scrolled / heroHeight, 1);
      setScrollProgress(progress);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isFullyScrolled = scrollProgress >= 0.95;

  const interpolate = (start: number, end: number) => {
    return start + (end - start) * scrollProgress;
  };

  const logoSize = interpolate(40, 32);
  const fontSize = interpolate(20, 16);
  const navFontSize = interpolate(16, 14);
  const navGap = interpolate(40, 32);
  const paddingY = interpolate(16, 12);
  const paddingX = interpolate(48, 32);
  const borderRadius = interpolate(0, 9999);
  const marginTop = interpolate(0, 24);
  const maxWidth = interpolate(100, 75);
  const bgOpacity = interpolate(1, 0.85);
  const blurAmount = interpolate(0, 24);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full">
      <div
        className="flex items-center justify-between border-gray-200/60 transition-all duration-300 ease-out"
        style={{
          backgroundColor: `rgba(255, 255, 255, ${bgOpacity})`,
          backdropFilter: `blur(${blurAmount}px)`,
          WebkitBackdropFilter: `blur(${blurAmount}px)`,
          borderRadius: `${borderRadius}px`,
          marginTop: `${marginTop}px`,
          marginLeft: 'auto',
          marginRight: 'auto',
          paddingTop: `${paddingY}px`,
          paddingBottom: `${paddingY}px`,
          paddingLeft: `${paddingX}px`,
          paddingRight: `${paddingX}px`,
          maxWidth: `${maxWidth}%`,
          borderWidth: isFullyScrolled ? '1px' : '0px',
          borderBottomWidth: isFullyScrolled ? '1px' : '1px',
          boxShadow: isFullyScrolled 
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' 
            : scrollProgress > 0 
              ? `0 ${interpolate(0, 25)}px ${interpolate(0, 50)}px -12px rgba(0, 0, 0, ${interpolate(0, 0.25)})`
              : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <Image
            src={octopusLogo}
            alt="100xSWE Logo"
            className="transition-all duration-300 ease-out"
            width={logoSize}
            height={logoSize}
            style={{
              width: `${logoSize}px`,
              height: `${logoSize}px`,
            }}
          />
          <span
            className="font-sans font-bold text-foreground transition-all duration-300 ease-out"
            style={{
              fontSize: `${fontSize}px`,
            }}
          >
            100xSWE
          </span>
        </div>

        <div
          className="hidden lg:flex flex-1 items-center justify-center font-sans font-medium transition-all duration-300 ease-out"
          style={{
            fontSize: `${navFontSize}px`,
            gap: `${navGap}px`,
          }}
        >
          <Link href="/" className="hover:text-muted-foreground transition-colors">
            Home
          </Link>
          <a href="#about" className="hover:text-muted-foreground transition-colors">
            About
          </a>
          <Link href="/dashboard" className="hover:text-muted-foreground transition-colors">
            Dashboard
          </Link>
        </div>

        <Button
          variant="cta"
          size={isFullyScrolled ? "sm" : "default"}
          className="rounded-full hidden lg:block transition-all duration-300 ease-out"
        >
          Sign Up
        </Button>

        <MobileMenu />
      </div>
    </nav>
  );
};

export default Navbar;