import { useEffect, useRef } from "react";
import * as d3 from "d3";

function colorForRisk(score) {
  if (score >= 0.8) return "#f95738";
  if (score >= 0.45) return "#f4a261";
  return "#4ecdc4";
}

export default function ForceGraph({ graph, selectedNodeId = null, onSelectNode = () => {} }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!graph || !ref.current) return;

    const width = ref.current.clientWidth || 640;
    const height = 420;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const simulation = d3
      .forceSimulation(graph.nodes.map((node) => ({ ...node })))
      .force("link", d3.forceLink(graph.edges).id((d) => d.id).distance(90))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .selectAll("line")
      .data(graph.edges)
      .enter()
      .append("line")
      .attr("stroke", "#6c757d")
      .attr("stroke-opacity", 0.45)
      .attr("stroke-width", (d) => Math.max(1.5, d.risk_score * 5));

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(simulation.nodes())
      .enter()
      .append("circle")
      .attr("r", 16)
      .attr("fill", (d) => colorForRisk(d.risk_score))
      .attr("stroke", (d) => (d.id === selectedNodeId ? "#f8f9fa" : "transparent"))
      .attr("stroke-width", (d) => (d.id === selectedNodeId ? 3 : 0))
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        onSelectNode(d.id);
      })
      .call(
        d3.drag()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    const labels = svg
      .append("g")
      .selectAll("text")
      .data(simulation.nodes())
      .enter()
      .append("text")
      .text((d) => d.label)
      .attr("font-size", 11)
      .attr("fill", "#f8f9fa")
      .attr("text-anchor", "middle")
      .attr("dy", 4);

    node.append("title").text((d) => `${d.label}: ${Math.round(d.risk_score * 100)}% risk`);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      labels.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });

    return () => simulation.stop();
  }, [graph, onSelectNode, selectedNodeId]);

  return <svg ref={ref} className="graph-canvas" />;
}
