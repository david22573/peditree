import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Dog, Parentage } from '../types';
import { buildPedigreeGraph } from '../graph/builder';

export interface PedigreeGraphRef {
  fit: () => void;
}

interface PedigreeGraphProps {
  dogs: Dog[];
  relationships: Parentage[];
  selectedDogId: string | null;
  onSelectDog: (dogId: string | null) => void;
}

export const PedigreeGraph = forwardRef<PedigreeGraphRef, PedigreeGraphProps>(
  ({ dogs, relationships, selectedDogId, onSelectDog }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<Network | null>(null);

    useImperativeHandle(ref, () => ({
      fit: () => {
        if (networkRef.current) {
          networkRef.current.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const { nodes, edges } = buildPedigreeGraph(dogs, relationships);

      const nodesDataSet = new DataSet(nodes as any);
      const edgesDataSet = new DataSet(edges as any);

      const data: any = {
        nodes: nodes,
        edges: edges,
      };

      const options: any = {
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD', // Up-Down top-to-bottom
            sortMethod: 'directed',
            levelSeparation: 100,
            nodeSpacing: 150,
            treeSpacing: 200,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
          },
        },
        physics: {
          enabled: false,
        },
        interaction: {
          hover: true,
          tooltipDelay: 150,
          selectable: true,
          selectConnectedEdges: false,
        },
        edges: {
          smooth: {
            type: 'cubicBezier',
            forceDirection: 'vertical',
            roundness: 0.4,
          },
        },
      };

      const network = new Network(containerRef.current, data, options);
      networkRef.current = network;

      network.on('selectNode', params => {
        const nodeId = params.nodes[0];
        if (nodeId && !nodeId.startsWith('union:')) {
          onSelectDog(nodeId);
        } else {
          onSelectDog(null);
        }
      });

      network.on('deselectNode', () => {
        onSelectDog(null);
      });

      return () => {
        network.destroy();
        networkRef.current = null;
      };
    }, [dogs, relationships]);

    // Update selection highlight
    useEffect(() => {
      if (networkRef.current) {
        if (selectedDogId) {
          networkRef.current.selectNodes([selectedDogId]);
        } else {
          networkRef.current.unselectAll();
        }
      }
    }, [selectedDogId]);

    return (
      <div className="canvas-container">
        <div ref={containerRef} className="vis-network-container" />
      </div>
    );
  }
);

PedigreeGraph.displayName = 'PedigreeGraph';
