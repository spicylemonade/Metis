// metis-agent/app/learn/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Download, Upload, Search, Info } from "lucide-react";
import { skillManager, Skill, SkillBundle, SkillLearningProgress } from "@/lib/skill-manager";

export default function LearnPage() {
  // State for skill bundles and upload
  const [marketplaceSkills, setMarketplaceSkills] = useState<SkillBundle[]>([]);
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [learningProgress, setLearningProgress] = useState<SkillLearningProgress[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [skillInfoDialogOpen, setSkillInfoDialogOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | SkillBundle | null>(null);
  const [uploadSuccessDialogOpen, setUploadSuccessDialogOpen] = useState(false);

  // Load skills on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  // Function to fetch all data
  const fetchAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchMarketplaceSkills(),
        fetchInstalledSkills(),
        fetchLearningProgress()
      ]);
    } catch (err) {
      setError("Failed to load skills data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to fetch marketplace skills
  const fetchMarketplaceSkills = async () => {
    try {
      const data = await skillManager.getMarketplaceSkillBundles();
      setMarketplaceSkills(data);
    } catch (err) {
      console.error("Failed to fetch marketplace skills:", err);
      throw err;
    }
  };

  // Function to fetch installed skills
  const fetchInstalledSkills = async () => {
    try {
      const data = await skillManager.getInstalledSkills();
      setInstalledSkills(data);
    } catch (err) {
      console.error("Failed to fetch installed skills:", err);
      throw err;
    }
  };

  // Function to fetch learning progress
  const fetchLearningProgress = async () => {
    try {
      const data = await skillManager.getLearningProgress();
      setLearningProgress(data);
    } catch (err) {
      console.error("Failed to fetch learning progress:", err);
      throw err;
    }
  };

  // Function to handle skill bundle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchMarketplaceSkills();
      return;
    }
    
    try {
      setIsLoading(true);
      const results = await skillManager.searchMarketplace(searchQuery);
      setMarketplaceSkills(results);
    } catch (err) {
      setError("Failed to search marketplace. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle video upload for learning
  const handleVideoUpload = async () => {
    try {
      setIsUploading(true);
      setError(null);
      const success = await skillManager.uploadLearningVideo();
      
      if (success) {
        setUploadSuccessDialogOpen(true);
        fetchLearningProgress();
        fetchInstalledSkills();
      } else {
        setError("Failed to process learning video. Please try again.");
      }
    } catch (err) {
      setError("An error occurred during video upload. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Function to install a skill bundle
  const handleInstallSkill = async (bundleId: string) => {
    try {
      setIsLoading(true);
      await skillManager.installSkillBundle(bundleId);
      fetchInstalledSkills();
      fetchLearningProgress();
    } catch (err) {
      setError("Failed to install skill bundle. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to view skill details
  const handleViewSkillDetails = (skill: Skill | SkillBundle) => {
    setSelectedSkill(skill);
    setSkillInfoDialogOpen(true);
  };

  // Filter marketplace skills by search query
  const filteredMarketplaceSkills = searchQuery
    ? marketplaceSkills.filter(
        (bundle) =>
          bundle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bundle.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bundle.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : marketplaceSkills;

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Learn</h2>
        <Button onClick={handleVideoUpload} disabled={isUploading}>
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? "Uploading..." : "Upload Learning Video"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
          <Button variant="link" className="p-0 mt-2" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Upload Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Learn From Videos</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload videos demonstrating actions you want Metis to learn. 
          Tutorial videos, screen recordings, or app demonstrations work best.
        </p>
        
        <div className="flex flex-col space-y-4">
          <div className="border border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
               onClick={handleVideoUpload}>
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <p className="font-medium">Drop video file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports MP4, WEBM, MOV (max 500MB)
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Current Learning Progress</h4>
            {learningProgress.length > 0 ? (
              <div className="space-y-3">
                {learningProgress.map((item) => {
                  const skill = installedSkills.find((s) => s.id === item.skillId);
                  return (
                    <div key={item.skillId} className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{skill?.name || item.skillId}</p>
                        <div className="w-full bg-muted rounded-full h-2 mt-1">
                          <div
                            className="bg-primary rounded-full h-2"
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        </div>
                      </div>
                      <span className="ml-4 text-sm">{item.progress}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active learning in progress. Upload a video to start learning new skills.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Skill Bundles Market */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Skill Bundles Market</h3>
          <div className="flex items-center">
            <Input
              type="text"
              placeholder="Search market..."
              className="mr-2 w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredMarketplaceSkills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredMarketplaceSkills.map((bundle) => (
              <Card key={bundle.id} className="p-4 flex flex-col">
                <div className="aspect-video bg-muted rounded-md mb-2 overflow-hidden">
                  {bundle.thumbnailUrl ? (
                    <img
                      src={bundle.thumbnailUrl}
                      alt={bundle.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-muted-foreground">No Preview</span>
                    </div>
                  )}
                </div>
                <h4 className="font-bold text-lg">{bundle.name}</h4>
                <p className="text-sm text-muted-foreground mb-2 flex-grow">
                  {bundle.description}
                </p>
                <div className="flex items-center text-xs text-muted-foreground mb-3">
                  <span className="mr-3">By: {bundle.author}</span>
                  <span className="mr-3">Downloads: {bundle.downloads}</span>
                  <span>Rating: {bundle.rating.toFixed(1)}/5</span>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => handleInstallSkill(bundle.id)}
                  >
                    <Download className="mr-1 h-3 w-3" /> Download
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleViewSkillDetails(bundle)}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-muted-foreground">No skill bundles found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try a different search term or check back later.
            </p>
          </div>
        )}
      </div>

      {/* Installed Skills Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-4">Installed Skills</h3>
        {installedSkills.length > 0 ? (
          <div className="space-y-4">
            {installedSkills.map((skill) => (
              <div key={skill.id} className="border p-3 rounded-md">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{skill.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {skill.description || "No description"}
                    </p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Version: {skill.version} | Added: {new Date(skill.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewSkillDetails(skill)}
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No skills installed yet.</p>
            <p className="text-sm mt-2">
              Download skills from the marketplace or upload learning videos.
            </p>
          </div>
        )}
      </Card>

      {/* Skill Info Dialog */}
      {skillInfoDialogOpen && selectedSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium">{selectedSkill.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedSkill.description}</p>
            </div>
            
            <div className="p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium">Details</h4>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="text-sm">Author:</div>
                    <div className="text-sm font-medium">{selectedSkill.author}</div>
                    
                    <div className="text-sm">Version:</div>
                    <div className="text-sm font-medium">{selectedSkill.version}</div>
                    
                    <div className="text-sm">Added:</div>
                    <div className="text-sm font-medium">
                      {new Date(selectedSkill.createdAt).toLocaleDateString()}
                    </div>
                    
                    <div className="text-sm">Last Updated:</div>
                    <div className="text-sm font-medium">
                      {new Date(selectedSkill.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                
                {'skills' in selectedSkill && (
                  <div>
                    <h4 className="text-sm font-medium">Included Skills</h4>
                    <ul className="mt-2 space-y-2">
                      {selectedSkill.skills.map((skill) => (
                        <li key={skill.id} className="text-sm">
                          • {skill.name} - {skill.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedSkill.tags && selectedSkill.tags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium">Tags</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedSkill.tags.map((tag: string, index: number) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-muted text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="border-t p-4 flex justify-between">
              <Button variant="outline" onClick={() => setSkillInfoDialogOpen(false)}>
                Close
              </Button>
              {'skills' in selectedSkill && (
                <Button onClick={() => handleInstallSkill(selectedSkill.id)}>
                  <Download className="mr-2 h-4 w-4" /> Install
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Success Dialog */}
      {uploadSuccessDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium">Video Processed Successfully</h3>
              <p className="text-sm text-muted-foreground">
                Your video has been uploaded and learning has begun. Metis is now analyzing the video to extract skills.
              </p>
            </div>
            
            <div className="p-4">
              <p className="mb-2">Learning progress will be updated as the video is processed.</p>
              <p className="text-sm text-muted-foreground">
                New skills discovered in the video will be added to your installed skills automatically.
              </p>
            </div>
            
            <div className="border-t p-4 flex justify-end">
              <Button onClick={() => setUploadSuccessDialogOpen(false)}>OK</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}