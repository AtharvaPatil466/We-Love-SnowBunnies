import { useEffect, useRef } from "react";
import * as d3 from "d3";

function colorForRisk(score) {
  if (score >= 0.8) return "#ff7c68";
  if (score >= 0.45) return "#ffbd73";
  return "#4cd6c1";
}

function edgeColorForRisk(score) {
  if (score >= 0.8) return "rgba(255, 124, 104, 0.7)";
  if (score >= 0.45) return "rgba(255, 189, 115, 0.55)";
  return "rgba(76, 214, 193, 0.38)";
}

function radiusForRisk(score, isSelected) {
  const base = score >= 0.8 ? 17 : score >= 0.45 ? 15 : 13;
  return isSelected ? base + 4 : base;
}

export default function ForceGraph({ graph, selectedNodeId = null, onSelectNode = () => {} }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!graph || !ref.current) {
      return undefined;
    }

    const width = ref.current.clientWidth || 720;
    const height = 460;
    const nodes = graph.nodes.map((node) => ({ ...node }));
    const edges = graph.edges.map((edge) => ({ ...edge }));
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const defs = svg.attr("viewBox", `0 0 ${width} ${height}`).append("defs");
    const glow = defs
      .append("filter")
      .attr("id", "node-glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    glow.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "blur");
    glow
      .append("feMerge")
      .selectAll("feMergeNode")
      .data(["blur", "SourceGraphic"])
      .enter()
      .append("feMergeNode")
      .attr("in", (value) => value);

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("rx", 22)
      .attr("fill", "rgba(4, 11, 20, 0.65)");

    svg
      .append("g")
      .attr("stroke", "rgba(188, 209, 229, 0.05)")
      .selectAll("line")
      .data(d3.range(1, 8))
      .enter()
      .append("line")
      .attr("x1", (index) => (width / 8) * index)
      .attr("x2", (index) => (width / 8) * index)
      .attr("y1", 18)
      .attr("y2", height - 18);

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((node) => node.id).distance(110).strength(0.55))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("collide", d3.forceCollide().radius((node) => radiusForRisk(node.risk_score, node.id === selectedNodeId) + 12))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .attr("class", "graph-links")
      .selectAll("line")
      .data(edges)
      .enter()
      .append("line")
      .attr("stroke", (edge) => edgeColorForRisk(edge.risk_score))
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", (edge) => Math.max(1.4, edge.risk_score * 4.8));

    const nodeGroup = svg
      .append("g")
      .attr("class", "graph-nodes")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .on("click", (_, node) => {
        onSelectNode(node.id);
      })
      .call(
        d3.drag()
          .on("start", (event, node) => {
            if (!event.active) {
              simulation.alphaTarget(0.24).restart();
            }
            node.fx = node.x;
            node.fy = node.y;
          })
          .on("drag", (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on("end", (event, node) => {
            if (!event.active) {
              simulation.alphaTarget(0);
            }
            node.fx = null;
            node.fy = null;
          })
      );

    nodeGroup
      .append("circle")
      .attr("r", (node) => radiusForRisk(node.risk_score, node.id === selectedNodeId) + 4)
      .attr("fill", (node) => colorForRisk(node.risk_score))
      .attr("opacity", 0.18)
      .attr("filter", "url(#node-glow)");

    nodeGroup
      .append("circle")
      .attr("r", (node) => radiusForRisk(node.risk_score, node.id === selectedNodeId))
      .attr("fill", (node) => colorForRisk(node.risk_score))
      .attr("stroke", (node) => (node.id === selectedNodeId ? "#f8fbff" : "rgba(248, 251, 255, 0.16)"))
      .attr("stroke-width", (node) => (node.id === selectedNodeId ? 2.6 : 1.4));

    nodeGroup
      .append("circle")
      .attr("r", (node) => Math.max(4, radiusForRisk(node.risk_score, node.id === selectedNodeId) * 0.34))
      .attr("fill", "rgba(255, 255, 255, 0.18)");

    const labels = svg
      .append("g")
      .attr("class", "graph-labels")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((node) => node.label)
      .attr("fill", "#e7edf5")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("text-anchor", "middle");

    nodeGroup
      .append("title")
      .text((node) => `${node.label}: ${Math.round(node.risk_score * 100)}% risk`);

    simulation.on("tick", () => {
      link
        .attr("x1", (edge) => edge.source.x)
        .attr("y1", (edge) => edge.source.y)
        .attr("x2", (edge) => edge.target.x)
        .attr("y2", (edge) => edge.target.y);

      nodeGroup.attr("transform", (node) => `translate(${node.x}, ${node.y})`);
      labels
        .attr("x", (node) => node.x)
        .attr("y", (node) => node.y + radiusForRisk(node.risk_score, node.id === selectedNodeId) + 18);
    });

    return () => simulation.stop();
  }, [graph, onSelectNode, selectedNodeId]);

  return <svg ref={ref} className="graph-canvas" />;
}
