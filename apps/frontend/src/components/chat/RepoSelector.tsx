"use client";

import { useState } from "react";

interface RepoSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const RepoSelector = ({ value, onChange }: RepoSelectorProps) => {
  const repos = [
    { value: "main-repo", label: "main-repo" },
    { value: "frontend-app", label: "frontend-app" },
    { value: "backend-api", label: "backend-api" },
  ];

  return (
    <div>
      <label className="text-sm font-medium mb-2 block">Repository</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Select a repository</option>
        {repos.map((repo) => (
          <option key={repo.value} value={repo.value}>
            {repo.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default RepoSelector;
