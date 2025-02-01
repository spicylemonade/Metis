"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const skillBundles = [
  {
    id: 1,
    title: "Skill Bundle 1",
    description: "Learn automation with this bundle.",
    image: "/placeholder-skill1.jpg",
  },
  {
    id: 2,
    title: "Skill Bundle 2",
    description: "Master UI design fundamentals.",
    image: "/placeholder-skill2.jpg",
  },
  {
    id: 3,
    title: "Skill Bundle 3",
    description: "Improve coding efficiency with tips.",
    image: "/placeholder-skill3.jpg",
  },
];

export default function LearnPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [marketSearch, setMarketSearch] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files ? e.target.files[0] : null);
  };

  const handleUpload = () => {
    console.log("Uploading", selectedFile);
  };

  const filteredBundles = skillBundles.filter(
    (bundle) =>
      bundle.title.toLowerCase().includes(marketSearch.toLowerCase()) ||
      bundle.description.toLowerCase().includes(marketSearch.toLowerCase())
  );

  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-semibold">Learn</h2>

      {/* Upload Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Upload Your Learning Video</h3>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="mb-4"
        />
        <Button variant="default" onClick={handleUpload}>
          Upload Video
        </Button>
      </Card>

      {/* Skill Bundles Market */}
      <div>
        <h3 className="text-xl font-bold mb-4">Skill Bundles Market</h3>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search market..."
            className="w-full border p-2 rounded"
            value={marketSearch}
            onChange={(e) => setMarketSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredBundles.map((bundle) => (
            <Card key={bundle.id} className="p-4">
              <div className="mb-2">
                <img
                  src={bundle.image}
                  alt={bundle.title}
                  className="w-full h-32 object-cover rounded"
                />
              </div>
              <h4 className="font-bold">{bundle.title}</h4>
              <p className="text-sm text-muted-foreground">
                {bundle.description}
              </p>
              <Button variant="secondary" className="mt-2">
                Download
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
