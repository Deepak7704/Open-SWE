"use client";

import Image from "next/image";
import logoImage from "@/assets/100xSWE_Light.png"
import dbImage from "@/assets/pinecone_logo.png"
import codeGraph from "@/assets/code_generation_light.png"
import files from "@/assets/relevant_files.png";
import candidateFiles from "@/assets/code_generation_white.png"
import compressedFiles from "@/assets/compressed_files_light.png";
import langgraphFlow from "@/assets/workflow_Light_bold.png";
import humanApproval from "@/assets/human_approval_light.png"
import pullRequest from "@/assets/pull_request_light.png"

const ProcessVisualization = () => {
    const steps = [
        { id: 1, title: "1.Database indexing", angle: 0, icon: dbImage },
        { id: 2, title: "2.Retrieve relevant files using RRF", angle: 45, icon: files },
        { id: 3, title: "3. AST & Code graph generation", angle: 90, icon: codeGraph },
        { id: 4, title: "4.Compressed code graphs", angle: 135, icon: compressedFiles },
        { id: 5, title: "5.Final files", angle: 180, icon: candidateFiles },
        { id: 6, title: "6.Langgraph workflow", angle: 225, icon: langgraphFlow },
        { id: 7, title: "7.Human approval", angle: 270, icon: humanApproval },
        { id: 8, title: "8.Raise Pull Request", angle: 315, icon: pullRequest },
    ];

    const round = (num: number, decimals: number = 6) => {
        return Number(num.toFixed(decimals));
    };

    const generateTentaclePath = (angle: number) => {
        const centerX = 50;
        const centerY = 50;
        const radius = 37.5;
        
        const angleRad = (angle * Math.PI) / 180;
        const endX = round(centerX + radius * Math.cos(angleRad));
        const endY = round(centerY + radius * Math.sin(angleRad));
        
        const control1Offset = radius * 0.3;
        const perpAngle1 = angleRad + Math.PI / 4;
        const cp1x = round(centerX + control1Offset * Math.cos(perpAngle1));
        const cp1y = round(centerY + control1Offset * Math.sin(perpAngle1));
        
        const control2Offset = radius * 0.7;
        const perpAngle2 = angleRad - Math.PI / 6;
        const cp2x = round(centerX + control2Offset * Math.cos(perpAngle2));
        const cp2y = round(centerY + control2Offset * Math.sin(perpAngle2));
        
        return `M ${centerX} ${centerY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
    };

    return (
        <div className="relative w-full h-full min-h-[400px] flex items-center justify-center">
            <div className="relative w-full aspect-square max-w-[500px] md:max-w-[600px] mx-auto">
                {/* Tentacle Connection Lines */}
                <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ zIndex: 5 }}
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    
                    {steps.map((step) => {
                        const path = generateTentaclePath(step.angle);
                        
                        return (
                            <g key={step.id}>
                                {/* Shadow layer - SOLID BLACK */}
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="#1a1a1a"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    opacity="0.5"
                                    filter="url(#glow)"
                                />
                                {/* Main tentacle - SOLID DARK GRAY */}
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="#2d2d2d"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    className="animate-pulse"
                                    style={{
                                        animationDelay: `${step.id * 0.1}s`,
                                        animationDuration: "3s",
                                    }}
                                />
                            </g>
                        );
                    })}
                </svg>

                {/* Central Octopus Logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ zIndex: 20 }}>
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-36 lg:h-36">
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-600/40 via-gray-700/50 to-gray-800/40 rounded-2xl md:rounded-3xl blur-xl md:blur-2xl animate-pulse" />
                        <div className="relative w-full h-full bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl md:rounded-3xl border-2 border-gray-700 shadow-2xl flex flex-col items-center justify-center overflow-hidden p-2 sm:p-3">
                            <Image
                                src={logoImage}
                                alt="Octopus Logo"
                                width={160}
                                height={160}
                                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 object-contain"
                                priority
                            />
                        </div>
                    </div>
                </div>

                {/* Step Icons */}
                {steps.map((step) => {
                    const angle = (step.angle * Math.PI) / 180;
                    const radius = 37.5;
                    const x = round(50 + radius * Math.cos(angle));
                    const y = round(50 + radius * Math.sin(angle));

                    return (
                        <div
                            key={step.id}
                            className="absolute group"
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                transform: "translate(-50%, -50%)",
                                zIndex: 10,
                            }}
                        >
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-gray-600/0 to-gray-700/0 group-hover:from-gray-600/30 group-hover:to-gray-700/40 rounded-xl md:rounded-2xl blur-lg md:blur-xl transition-all duration-300" />
                                <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-18 md:h-18 lg:w-20 lg:h-20 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl md:rounded-2xl border-2 border-gray-700 shadow-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:border-gray-600 overflow-hidden">
                                    {step.icon ? (
                                        <Image
                                            src={step.icon}
                                            alt={step.title}
                                            width={56}
                                            height={56}
                                            className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 lg:w-12 lg:h-12 object-contain"
                                        />
                                    ) : (
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-gray-700 to-gray-600 rounded-lg md:rounded-xl flex items-center justify-center">
                                            <span className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl">
                                                {step.id}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="absolute top-full mt-2 md:mt-3 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="bg-foreground text-background px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] sm:text-xs md:text-sm font-sans font-medium">
                                    {step.title}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ProcessVisualization;