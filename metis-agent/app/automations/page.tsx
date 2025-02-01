"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AutomationsPage() {
  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-semibold">Automations</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Suggested Automations */}
        <Card className="p-4">
          <h3 className="font-bold mb-2">Suggested Automations</h3>
          <ul className="list-disc ml-5">
            <li>
              Automatically click "Submit" button –{" "}
              <span className="text-sm text-muted-foreground">Similarity: 70%</span>
              <div className="mt-2">
                <Button variant="outline" size="sm" className="mr-2">
                  Approve
                </Button>
                <Button variant="secondary" size="sm">
                  Customize
                </Button>
              </div>
            </li>
            <li>
              Auto-fill form data –{" "}
              <span className="text-sm text-muted-foreground">Similarity: 65%</span>
              <div className="mt-2">
                <Button variant="outline" size="sm" className="mr-2">
                  Approve
                </Button>
                <Button variant="secondary" size="sm">
                  Customize
                </Button>
              </div>
            </li>
          </ul>
        </Card>

        {/* Active Automations */}
        <Card className="p-4">
          <h3 className="font-bold mb-2">Active Automations</h3>
          <ul className="list-disc ml-5">
            <li>
              <div className="flex justify-between items-center">
                <span>ClickBtnAutomation</span>
                <Button size="sm" variant="destructive">
                  Stop
                </Button>
              </div>
            </li>
            <li>
              <div className="flex justify-between items-center">
                <span>FillInputAutomation</span>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
              </div>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
