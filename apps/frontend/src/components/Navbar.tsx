"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import octopusLogo from "@/assets/octopus.png";
import MobileMenu from "@/components/MobileMenu";
import Image from "next/image";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full">
      <div className="bg-white border-b border-border px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src={octopusLogo} alt="100xSWE Logo" className="h-8 w-8" width={32} height={32} />
          <span className="font-sans text-lg font-bold text-foreground">100xSWE</span>
        </div>

        <div className="hidden lg:flex flex-1 items-center justify-center gap-8 font-sans text-sm font-medium">
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
          size="sm"
          className="rounded-full hidden lg:block"
        >
          Sign Up
        </Button>

        <MobileMenu />
      </div>
    </nav>
  );
};

export default Navbar;
