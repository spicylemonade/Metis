"use client";

import React, { useRef } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { useMindMapContext } from "./MindMapContext";

export interface NodeData {
  id: string;
  group?: number;
  skill?: number; // Higher value = larger node
  // These properties are added by the simulation:
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number; // Only number (or undefined)
  fy?: number;
}

export interface LinkData {
  source: string;
  target: string;
}

const data = {
  nodes: [
    { id: "Programming", group: 1, skill: 10 },
    { id: "Web Development", group: 1, skill: 8 },
    { id: "React", group: 1, skill: 6 },
    { id: "Next.js", group: 1, skill: 5 },
    { id: "Node.js", group: 1, skill: 6 },
    { id: "UI/UX", group: 2, skill: 7 },
    { id: "Design", group: 2, skill: 7 },
    { id: "Illustration", group: 2, skill: 5 },
    { id: "DevOps", group: 3, skill: 8 },
    { id: "Docker", group: 3, skill: 6 },
    { id: "Kubernetes", group: 3, skill: 6 },
  ] as NodeData[],
  links: [
    { source: "Programming", target: "Web Development" },
    { source: "Web Development", target: "React" },
    { source: "Web Development", target: "Next.js" },
    { source: "Web Development", target: "Node.js" },
    { source: "Programming", target: "UI/UX" },
    { source: "UI/UX", target: "Design" },
    { source: "UI/UX", target: "Illustration" },
    { source: "Programming", target: "DevOps" },
    { source: "DevOps", target: "Docker" },
    { source: "DevOps", target: "Kubernetes" },
  ] as LinkData[],
};

export function MindMap() {
  const { highlightQuery } = useMindMapContext();
  const fgRef = useRef<ForceGraphMethods<NodeData, LinkData> | undefined>(undefined);

  // Custom drawing function: highlights nodes whose id contains the highlight query.
  const nodeCanvasObject = (
    node: NodeData,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const baseRadius = node.skill || 4;
    const isHighlighted =
      highlightQuery.trim() !== "" &&
      node.id.toLowerCase().includes(highlightQuery.toLowerCase());
    const radius = isHighlighted ? baseRadius + 3 : baseRadius;

    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = isHighlighted ? "#fcd15b" : "gray";
    ctx.fill();

    if (isHighlighted) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fcd15b";
      ctx.stroke();
    }
  };

  return (
    <div
      className="w-full h-64 border p-2 rounded overflow-hidden bg-transparent"
      onDoubleClick={() => {
        if (fgRef.current) {
          fgRef.current.zoomToFit(400, 40);
        }
      }}
    >
      <ForceGraph2D<NodeData, LinkData>
        ref={fgRef}
        graphData={data as any} // Casting to any to bypass strict type issues.
        width={240}
        height={240}
        backgroundColor="transparent"
        nodeCanvasObject={nodeCanvasObject}
        linkColor={() => "#888"}
        nodeAutoColorBy="group"
        nodeLabel="id"
        nodeVal={(node: NodeData) => node.skill || 1}
        d3AlphaDecay={0.01}
        onNodeDragEnd={(node: NodeData) => {
          // Release the node so the simulation can take over.
          node.fx = undefined;
          node.fy = undefined;
        }}
        onNodeHover={(node) => {
          let canvasEl: HTMLCanvasElement | null = null;
          if (fgRef.current) {
            if (typeof (fgRef.current as any).canvas === "function") {
              canvasEl = (fgRef.current as any).canvas();
            } else if ((fgRef.current as any).canvas) {
              canvasEl = (fgRef.current as any).canvas;
            }
          }
          if (!canvasEl) {
            canvasEl = document.querySelector("canvas");
          }
          if (canvasEl) {
            canvasEl.style.cursor = node ? "pointer" : "";
          }
        }}
      />
    </div>
  );
}
