"use client";

import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HelpSupportPage() {
  return (
    <div className="space-y-8 p-6">
      <h2 className="text-2xl font-semibold">Help & Support</h2>

      {/* Documentation Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Documentation</h3>
        <ul className="list-disc ml-5">
          <li>
            <Link href="/docs/user-guide" className="text-blue-500 hover:underline">
              User Guide
            </Link>
          </li>
          <li>
            <Link href="/docs/api-reference" className="text-blue-500 hover:underline">
              API Reference
            </Link>
          </li>
          <li>
            <Link href="/docs/faqs" className="text-blue-500 hover:underline">
              FAQs
            </Link>
          </li>
        </ul>
      </Card>

      {/* Tutorials Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Tutorials</h3>
        <ul className="list-disc ml-5">
          <li>
            <Link href="/tutorials/getting-started" className="text-blue-500 hover:underline">
              Getting Started
            </Link>
          </li>
          <li>
            <Link href="/tutorials/first-automation" className="text-blue-500 hover:underline">
              Creating Your First Automation
            </Link>
          </li>
          <li>
            <Link href="/tutorials/vscode-integration" className="text-blue-500 hover:underline">
              Integrating with VSCode
            </Link>
          </li>
        </ul>
      </Card>

      {/* Support Channels Section */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Support Channels</h3>
        <p>
          Email:{" "}
          <a href="mailto:support@automationagent.com" className="text-blue-500 hover:underline">
            support@automationagent.com
          </a>
        </p>
        <p>
          Chat: <Button variant="link">Start Chat</Button>
        </p>
        <p>
          Community Forum:{" "}
          <Link href="/forum" className="text-blue-500 hover:underline">
            Visit Forum
          </Link>
        </p>
      </Card>

      {/* Feedback Form */}
      <Card className="p-4">
        <h3 className="font-bold mb-2">Feedback</h3>
        <p>We'd love to hear your thoughts, suggestions, or concerns!</p>
        <textarea
          placeholder="Your feedback..."
          className="w-full border p-2 rounded mb-2"
          rows={4}
        ></textarea>
        <Button variant="default">Submit Feedback</Button>
      </Card>
    </div>
  );
}
