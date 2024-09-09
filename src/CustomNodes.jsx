import React, { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  MiniMap,
  Controls,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import "./index.css";

const initBgColor = "#1A192B";

const connectionLineStyle = { stroke: "#fff" };
const snapGrid = [20, 20];

const defaultViewport = { x: 0, y: 0, zoom: 1.5 };

const CustomNodeFlow = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [bgColor, setBgColor] = useState(initBgColor);

  useEffect(() => {
    setNodes([
      {
        id: "1",
        type: "input",
        data: { label: "An input node" },
        position: { x: 0, y: 50 },
        sourcePosition: "right",
      },
      {
        id: "3",
        type: "output",
        data: { label: "Output A" },
        position: { x: 650, y: 25 },
        targetPosition: "left",
      },
      {
        id: "4",
        type: "output",
        data: { label: "Output B" },
        position: { x: 650, y: 100 },
        targetPosition: "left",
      },
    ]);

    setEdges([
      {
        id: "e1-2",
        source: "1",
        target: "3",
        animated: true,
        style: { stroke: "#fff" },
      },
      {
        id: "e2b-4",
        source: "1",
        target: "4",
        animated: true,
        style: { stroke: "#fff" },
      },
    ]);
  }, []);

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: "#fff" } }, eds)
      ),
    []
  );
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      style={{ background: bgColor }}
      connectionLineStyle={connectionLineStyle}
      snapToGrid={true}
      snapGrid={snapGrid}
      defaultViewport={defaultViewport}
      fitView
      attributionPosition="bottom-left"
    >
      <MiniMap
        nodeStrokeColor={(n) => {
          if (n.type === "input") return "#0041d0";
          if (n.type === "selectorNode") return bgColor;
          if (n.type === "output") return "#ff0072";
        }}
        nodeColor={(n) => {
          if (n.type === "selectorNode") return bgColor;
          return "#fff";
        }}
      />
      <Controls />
      TEST TEST
    </ReactFlow>
  );
};

export default CustomNodeFlow;
