import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Dog, Parentage } from '../types';
import { buildPedigreeGraph } from '../graph/builder';
import { calculateConnectedComponents, detectCycle } from '../graph/algorithms';
import { ZoomIn, ZoomOut, Maximize2, ArrowDownUp, ArrowLeftRight, AlertTriangle } from 'lucide-react';

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
    const [direction, setDirection] = useState<'UD' | 'LR'>('UD');

    // Connected components for status display (matching index.html)
    const familyCount = useMemo(() => {
      return calculateConnectedComponents(dogs, relationships).size;
    }, [dogs, relationships]);

    const hasCycle = useMemo(() => {
      return detectCycle(dogs, relationships);
    }, [dogs, relationships]);

    const handleFit = () => {
      if (networkRef.current) {
        networkRef.current.fit({
          animation: { duration: 400, easingFunction: 'easeInOutQuad' },
        });
      }
    };

    const handleZoomIn = () => {
      if (networkRef.current) {
        const scale = networkRef.current.getScale();
        networkRef.current.moveTo({ scale: scale * 1.25, animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      }
    };

    const handleZoomOut = () => {
      if (networkRef.current) {
        const scale = networkRef.current.getScale();
        networkRef.current.moveTo({ scale: scale * 0.8, animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      }
    };

    useImperativeHandle(ref, () => ({
      fit: handleFit,
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const { nodes, edges } = buildPedigreeGraph(dogs, relationships);

      const data: any = {
        nodes: nodes,
        edges: edges,
      };

      const options: any = {
        autoResize: true,
        layout: {
          hierarchical: {
            enabled: true,
            direction,
            sortMethod: 'directed',
            shakeTowards: 'roots',
            nodeSpacing: 150,
            levelSeparation: 100,
            treeSpacing: 220,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
          },
        },
        physics: false,
        interaction: {
          hover: true,
          navigationButtons: true,
          keyboard: {
            enabled: true,
            bindToWindow: false,
          },
          tooltipDelay: 150,
          selectable: true,
          selectConnectedEdges: false,
        },
        nodes: {
          widthConstraint: {
            minimum: 110,
            maximum: 180,
          },
          chosen: true,
        },
        edges: {
          width: 1.5,
          color: {
            color: '#94a3b8',
            highlight: '#f8fafc',
            hover: '#cbd5e1',
            inherit: false,
          },
          selectionWidth: 2,
          hoverWidth: 2,
          smooth: {
            enabled: true,
            type: 'cubicBezier',
            forceDirection: direction === 'UD' ? 'vertical' : 'horizontal',
            roundness: 0.35,
          },
        },
      };

      const network = new Network(containerRef.current, data, options);
      networkRef.current = network;

      network.once('afterDrawing', () => {
        network.fit({
          animation: {
            duration: 400,
            easingFunction: 'easeInOutQuad',
          },
        });
      });

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
    }, [dogs, relationships, direction]);

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

    const activeDogsCount = dogs.filter(d => !d.deleted_at).length;

    return (
      <div className="canvas-container">
        {/* Status bar matching index.html */}
        <div className="graph-status-bar" role="status" aria-live="polite">
          <div className="status-text">
            <span>
              <strong>{activeDogsCount}</strong> dog{activeDogsCount === 1 ? '' : 's'} across{' '}
              <strong>{familyCount}</strong> separate family group{familyCount === 1 ? '' : 's'}.
            </span>
            {hasCycle && (
              <span className="cycle-alert-badge" title="Ancestry cycle detected in dataset">
                <AlertTriangle size={14} /> Cycle Detected
              </span>
            )}
          </div>
          <div className="canvas-toolbar">
            <button
              className="canvas-btn"
              onClick={handleZoomIn}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button
              className="canvas-btn"
              onClick={handleZoomOut}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="canvas-btn"
              onClick={handleFit}
              title="Fit View"
            >
              <Maximize2 size={16} />
            </button>
            <button
              className="canvas-btn"
              onClick={() => setDirection(d => (d === 'UD' ? 'LR' : 'UD'))}
              title={direction === 'UD' ? 'Switch to Horizontal Layout (LR)' : 'Switch to Vertical Layout (UD)'}
            >
              {direction === 'UD' ? <ArrowLeftRight size={16} /> : <ArrowDownUp size={16} />}
            </button>
          </div>
        </div>

        <div ref={containerRef} className="vis-network-container" id="network" aria-label="Interactive dog family tree" />
      </div>
    );
  }
);

PedigreeGraph.displayName = 'PedigreeGraph';
