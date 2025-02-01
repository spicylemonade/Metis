"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ActionHistoryPage() {
  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-semibold">Action History</h2>
      <Card className="p-4">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search actions..."
            className="w-full border p-2 rounded"
          />
        </div>
        <div className="space-y-3">
          <div className="border-b pb-2">
            <p className="text-sm">10:15 AM - Clicked "Submit" on form</p>
          </div>
          <div className="border-b pb-2">
            <p className="text-sm">10:16 AM - Typed "example" in search field</p>
          </div>
          <div className="border-b pb-2">
            <p className="text-sm">10:17 AM - Navigated to Dashboard</p>
          </div>
        </div>
        <Button variant="link" className="mt-4">
          View Full Log
        </Button>
      </Card>
    </div>
  );
}
